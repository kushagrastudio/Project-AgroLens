"""Plain-language crop care suggestions for common PlantVillage classes.

These suggestions are general educational information, not a diagnosis or a pesticide prescription.
"""

import re


def parse_label(label: str) -> tuple[str, str, bool]:
    raw = str(label or "Unknown")
    # HF PlantVillage labels commonly use forms such as Tomato___Early_blight.
    parts = re.split(r"_{2,}", raw.strip())
    crop = parts[0].replace("_", " ").strip().title() if parts else "Unknown crop"
    disease_raw = parts[-1] if len(parts) > 1 else raw
    disease = disease_raw.replace("_", " ").replace("(", " (").strip().title()
    healthy = "healthy" in raw.lower()
    if healthy:
        disease = "Healthy leaf pattern detected"
    return crop, disease, healthy


def get_advice(label: str, confidence: float) -> dict:
    crop, disease, healthy = parse_label(label)
    lower = label.lower().replace("_", " ")

    if confidence < 0.45:
        summary = f"The model is not confident enough to identify the issue reliably on this {crop.lower()} leaf. Several problems can look alike in a photo."
        steps = [
            "Retake a clear photo of one affected leaf in natural light, with the whole leaf in focus.",
            "Photograph both sides of the leaf and include nearby healthy leaves for comparison.",
            "Ask your local Krishi Vigyan Kendra (KVK) or agriculture officer to confirm the cause before treatment.",
        ]
        severity = "Needs confirmation"
    elif healthy:
        summary = f"The model's closest match is a healthy {crop.lower()} leaf. Keep monitoring new growth and nearby plants."
        steps = [
            "Continue regular field scouting, especially after humid or rainy weather.",
            "Keep tools clean and avoid moving soil or plant debris between affected plots.",
            "Take another photo if new spots, curling, yellowing, or wilting appear.",
        ]
        severity = "No obvious disease pattern"
    else:
        severity = "Monitor closely" if confidence < 0.75 else "Act promptly"
        if "early blight" in lower:
            summary = "The image most closely matches early blight, a leaf disease associated with dark spots that can expand and reduce healthy leaf area. A photo alone cannot confirm the cause in the field."
            steps = [
                "Remove badly affected leaves where practical; do not leave infected debris in the field.",
                "Water near the soil instead of wetting foliage, and improve airflow between plants.",
                "Avoid working among wet plants; clean tools and rotate crops where feasible.",
                "Ask a local agriculture expert which locally registered treatment, if any, is appropriate for this crop and stage.",
            ]
        elif "late blight" in lower:
            summary = "The image most closely matches a late-blight pattern. Blight-like symptoms can spread quickly in favourable wet conditions and need prompt local confirmation."
            steps = [
                "Inspect nearby plants and photograph both sides of affected leaves.",
                "Avoid overhead irrigation and remove severely affected plant material safely.",
                "Contact your KVK or agriculture officer promptly for confirmation and locally approved control options.",
            ]
        elif "bacterial spot" in lower:
            summary = "The image most closely matches a bacterial-spot pattern. Leaf spots can have several causes, so confirm locally before choosing a treatment."
            steps = [
                "Avoid handling plants when wet and reduce water splash between plants.",
                "Remove badly affected debris and sanitize tools between plots.",
                "Use clean planting material and seek local advice before applying any plant-protection product.",
            ]
        elif "powdery mildew" in lower or "leaf mold" in lower:
            summary = "The image most closely matches a fungal leaf-disease pattern. Humidity, canopy density, and crop conditions can influence its spread."
            steps = [
                "Improve airflow by following crop-appropriate spacing and pruning guidance.",
                "Avoid prolonged leaf wetness and remove heavily affected debris when practical.",
                "Confirm the diagnosis with a local agriculture expert before treatment.",
            ]
        elif "rust" in lower:
            summary = "The image most closely matches a rust-like disease pattern. Rust symptoms and look-alikes vary by crop and should be checked locally."
            steps = [
                "Inspect surrounding plants for similar orange, brown, or powdery spots.",
                "Avoid moving infected plant debris between fields; clean tools after scouting.",
                "Ask a local crop specialist for a crop-specific response and approved treatment options.",
            ]
        elif "virus" in lower or "mosaic" in lower or "yellow leaf curl" in lower:
            summary = "The image most closely matches a virus-like symptom pattern. Viral symptoms may resemble nutrient stress or other disorders; many plant viruses are spread by insect vectors."
            steps = [
                "Check neighbouring plants and look for insects on the undersides of leaves.",
                "Do not move suspicious planting material to other fields; seek local confirmation.",
                "Ask an agriculture officer about locally recommended vector management and whether affected plants should be removed.",
            ]
        elif "spider mite" in lower:
            summary = "The image most closely matches spider-mite damage. Fine stippling, bronzing, and webbing may occur, but confirm by checking leaf undersides."
            steps = [
                "Inspect the undersides of leaves with a hand lens for mites or webbing.",
                "Avoid unnecessary broad-spectrum pesticide use that may harm beneficial insects.",
                "Ask a local specialist about integrated pest management options for your crop.",
            ]
        elif "scab" in lower or "septoria" in lower or "target spot" in lower or "leaf spot" in lower or "black rot" in lower:
            summary = "The image most closely matches a leaf-spot or rot disease pattern. Similar marks can be caused by fungi, bacteria, weather, or nutrient stress."
            steps = [
                "Photograph several affected leaves and note when symptoms began.",
                "Remove heavily affected debris when practical and avoid splashing water onto foliage.",
                "Confirm the cause locally before applying a disease-control product.",
            ]
        else:
            summary = f"The model's closest match is {disease.lower()} on {crop.lower()}. Image-based predictions can be wrong, especially with field conditions or unfamiliar varieties."
            steps = [
                "Take clear photos of the affected leaf from both sides and note recent weather and watering.",
                "Keep the affected plant area under observation and avoid spreading plant debris or contaminated tools.",
                "Get a local diagnosis before applying chemicals or removing large numbers of plants.",
            ]

    scheme = {
        "name": "Pradhan Mantri Fasal Bima Yojana (PMFBY)",
        "description": "Crop insurance may cover eligible yield losses due to notified risks, including pests and diseases, subject to the notified crop/area, policy conditions, and scheme rules. A leaf prediction does not establish a claim or eligibility.",
        "action": "Check your policy and the current state/crop notification. If insured crop loss has occurred, report it promptly through official channels and keep photos and records.",
        "url": "https://pmfby.gov.in/",
        "helpline": "14447",
    }

    return {
        "plant": crop,
        "disease": disease,
        "healthy": healthy,
        "severity": severity,
        "summary": summary,
        "steps": steps,
        "scheme": scheme,
    }
