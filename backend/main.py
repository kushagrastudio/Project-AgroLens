from __future__ import annotations

import base64
import io
import os
import threading
from typing import Any

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps, UnidentifiedImageError
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from .advisory import get_advice

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(APP_DIR, "frontend")
MODEL_ID = os.getenv("AGROLENS_MODEL_ID", "mesabo/agri-plant-disease-resnet50")
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "BMP"}

app = FastAPI(title="AgroLens API", version="1.0.0", description="Plant leaf disease screening and farmer guidance")
app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIR, "assets")), name="assets")

_model_lock = threading.Lock()
_inference_lock = threading.Lock()
_model: Any = None
_processor: Any = None
_load_error: str | None = None
_last_conv: Any = None
_activations: Any = None


def _load_model() -> None:
    global _model, _processor, _load_error, _last_conv
    if _model is not None:
        return
    with _model_lock:
        if _model is not None:
            return
        try:
            import torch
            from transformers import AutoImageProcessor, AutoModelForImageClassification

            # First analysis downloads the public checkpoint (~95 MB) if not cached.
            _processor = AutoImageProcessor.from_pretrained(MODEL_ID)
            _model = AutoModelForImageClassification.from_pretrained(MODEL_ID)
            _model.eval()
            _load_error = None
            convs = [module for module in _model.modules() if isinstance(module, torch.nn.Conv2d)]
            if not convs:
                raise RuntimeError("The selected model has no convolutional layer for heatmap generation.")
            _last_conv = convs[-1]
            _last_conv.register_forward_hook(_capture_activation)
        except Exception as exc:  # surface a concise actionable error to the UI
            _load_error = f"Could not load the disease model: {type(exc).__name__}: {exc}"
            _model = None
            _processor = None
            raise RuntimeError(_load_error) from exc


def _capture_activation(module: Any, inputs: Any, output: Any) -> None:
    global _activations
    _activations = output
    if getattr(output, "requires_grad", False):
        output.retain_grad()


def _heatmap_png(image: Image.Image, cam: np.ndarray) -> str:
    """Blend Grad-CAM onto the original image and return a data URL."""
    from PIL import Image as PILImage

    width, height = image.size
    cam_img = PILImage.fromarray(np.uint8(np.clip(cam, 0, 1) * 255), mode="L")
    cam_img = cam_img.resize((width, height), PILImage.Resampling.BILINEAR)
    heat = np.asarray(cam_img).astype(np.float32) / 255.0

    # Compact blue -> cyan -> yellow -> red map similar to common Grad-CAM displays.
    red = np.clip(1.5 - np.abs(4 * heat - 3), 0, 1)
    green = np.clip(1.5 - np.abs(4 * heat - 2), 0, 1)
    blue = np.clip(1.5 - np.abs(4 * heat - 1), 0, 1)
    heat_rgb = np.stack([red, green, blue], axis=-1)
    source = np.asarray(image.convert("RGB")).astype(np.float32) / 255.0
    blended = np.clip(source * 0.58 + heat_rgb * 0.42, 0, 1)
    out = PILImage.fromarray(np.uint8(blended * 255), mode="RGB")
    buff = io.BytesIO()
    out.save(buff, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buff.getvalue()).decode("ascii")


def _predict(image: Image.Image) -> dict:
    import torch
    import torch.nn.functional as F

    global _activations
    inputs = _processor(images=image, return_tensors="pt")
    _model.zero_grad(set_to_none=True)
    _activations = None

    with torch.enable_grad():
        outputs = _model(**inputs)
        probs = torch.softmax(outputs.logits[0].detach(), dim=-1)
        count = min(3, int(probs.shape[-1]))
        top_probs, top_ids = torch.topk(probs, k=count)
        top_idx = int(top_ids[0].item())
        score = outputs.logits[0, top_idx]
        score.backward()

        cam = None
        if _activations is not None and getattr(_activations, "grad", None) is not None:
            activations = _activations.detach()
            gradients = _activations.grad.detach()
            weights = gradients.mean(dim=(2, 3), keepdim=True)
            cam_tensor = (weights * activations).sum(dim=1, keepdim=True).relu()
            cam_tensor = F.interpolate(cam_tensor, size=(224, 224), mode="bilinear", align_corners=False)
            cam_arr = cam_tensor[0, 0].cpu().numpy()
            cam_arr -= cam_arr.min()
            peak = float(cam_arr.max())
            if peak > 1e-8:
                cam_arr /= peak
            cam = cam_arr

    idx_to_label = getattr(_model.config, "id2label", {}) or {}
    def label_for(i: int) -> str:
        return str(idx_to_label.get(i, idx_to_label.get(str(i), f"Class {i}")))

    predicted_label = label_for(top_idx)
    top_predictions = [
        {"label": label_for(int(i.item())), "confidence": round(float(p.item()) * 100, 1)}
        for p, i in zip(top_probs, top_ids)
    ]
    if cam is None:
        cam = np.zeros((224, 224), dtype=np.float32)
    heatmap = _heatmap_png(image, cam)
    return {
        "raw_label": predicted_label,
        "confidence": round(float(probs[top_idx].item()) * 100, 1),
        "top_predictions": top_predictions,
        "heatmap": heatmap,
    }


@app.get("/")
def home() -> FileResponse:
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


@app.get("/styles.css")
def styles() -> FileResponse:
    return FileResponse(os.path.join(FRONTEND_DIR, "styles.css"), media_type="text/css")


@app.get("/app.js")
def javascript() -> FileResponse:
    return FileResponse(os.path.join(FRONTEND_DIR, "app.js"), media_type="application/javascript")


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "model_loaded": _model is not None,
        "model_id": MODEL_ID,
        "model_note": "The model is loaded on the first analysis request and cached locally afterward.",
        "last_error": _load_error,
    }


@app.post("/api/analyze")
async def analyze_leaf(file: UploadFile = File(...)) -> dict:
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="Please upload an image file (JPG, PNG, or WEBP).")
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if not data:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image is too large. Maximum file size is 10 MB.")
    try:
        with Image.open(io.BytesIO(data)) as opened:
            if opened.format not in ALLOWED_FORMATS:
                raise HTTPException(status_code=415, detail="Supported formats: JPG, PNG, WEBP, BMP.")
            image = ImageOps.exif_transpose(opened).convert("RGB")
            image.load()
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(status_code=400, detail="We couldn't read that image. Try a clear JPG or PNG photo.")

    # Limit memory and response size for very large phone photos.
    image.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
    try:
        _load_model()
        # Grad-CAM hooks share state, so serialize inference requests in this simple demo API.
        with _inference_lock:
            result = _predict(image)
    except Exception as exc:
        detail = str(exc)
        if "Could not load the disease model" not in detail:
            detail = f"Inference failed: {type(exc).__name__}: {exc}"
        raise HTTPException(
            status_code=503,
            detail=(detail + " Check your internet connection for the first model download, then restart the app. See README troubleshooting."),
        )

    advice = get_advice(result["raw_label"], result["confidence"] / 100.0)
    return {
        "status": "success",
        "model_id": MODEL_ID,
        "plant": advice["plant"],
        "disease": advice["disease"],
        "healthy": advice["healthy"],
        "confidence": result["confidence"],
        "severity": advice["severity"],
        "summary": advice["summary"],
        "steps": advice["steps"],
        "scheme": advice["scheme"],
        "top_predictions": result["top_predictions"],
        "heatmap": result["heatmap"],
        "disclaimer": "AgroLens is an early-screening prototype, not a laboratory diagnosis. The model was trained on curated leaf images and may be less accurate on real farm photos. Confirm with a KVK/agriculture officer before treatment decisions.",
    }
