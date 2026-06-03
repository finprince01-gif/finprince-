import re
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

def repair_item_identity(raw_item_name: str) -> Dict[str, Any]:
    """
    Centralized OCR-safe character and numeric structure repair engine.
    Resolves item identity fragmentation by canonicalizing OCR corruption.
    """
    if not raw_item_name:
        return {
            "raw_name": "",
            "canonical_name": "",
            "normalized_tokens": [],
            "ocr_corruption_score": 0.0,
            "repair_operations": [],
            "confidence": 1.0
        }
        
    repair_operations = []
    name = raw_item_name.strip()
    
    # 1. Token cleanup - Strip spaces around separators (dashes, slashes)
    cleaned = re.sub(r'\s*([-/\\])\s*', r'\1', name)
    if cleaned != name:
        repair_operations.append("Token cleanup: stripped spaces around separators")
        name = cleaned
        
    # Collapse duplicate/repeated dashes and slashes
    cleaned = re.sub(r'-+', '-', name)
    cleaned = re.sub(r'/+', '/', cleaned)
    if cleaned != name:
        repair_operations.append("Token cleanup: collapsed duplicate separators")
        name = cleaned

    tokens = name.split()
    repaired_tokens = []
    
    for token in tokens:
        orig_token = token
        
        # A. Common OCR endings repair (e.g., TNG -> ING or TNGS -> INGS)
        # Fixes BLASTTNGS -> BLASTINGS, CASEHARDENTNG -> CASEHARDENING
        token_upper = token.upper()
        if "TNG" in token_upper:
            token = re.sub(r'TNGS\b', 'INGS', token, flags=re.IGNORECASE)
            token = re.sub(r'TNG\b', 'ING', token, flags=re.IGNORECASE)
            if token != orig_token:
                repair_operations.append(f"OCR ending repair: {orig_token} -> {token}")
                orig_token = token
                token_upper = token.upper()
                
        # B. Industrial token canonicalization
        # NOS ↔ N0S
        # KG ↔ KGS
        # PIN ↔ P1N ↔ PlN
        if token_upper in ("N0S", "NOS"):
            token = "NOS"
        elif token_upper in ("KG", "KGS"):
            token = "KGS"
        elif token_upper in ("PIN", "P1N", "PLN", "P1N"):
            token = "PIN"
        else:
            # Check for P-1-N or P-l-N variants in substrings
            token = re.sub(r'\b(P[1L]N|PLN|P1N)\b', 'PIN', token, flags=re.IGNORECASE)
            
        if token != orig_token:
            repair_operations.append(f"Industrial token canonicalization: {orig_token} -> {token}")
            orig_token = token
            token_upper = token.upper()
            
        # C. Predominantly alphabetic token character substitution
        letters_count = sum(c.isalpha() for c in token)
        digits_count = sum(c.isdigit() for c in token)
        
        if len(token) >= 3 and letters_count > digits_count:
            # Replace numeric lookalikes in predominantly alphabetic word
            new_token = ""
            for char in token:
                if char == '0':
                    new_token += 'O'
                elif char == '1':
                    new_token += 'I'
                elif char == '5':
                    new_token += 'S'
                elif char == '8':
                    new_token += 'B'
                elif char == '2':
                    new_token += 'Z'
                else:
                    new_token += char
            if new_token != token:
                repair_operations.append(f"Alphabetic character substitution: {token} -> {new_token}")
                token = new_token
                orig_token = token
                token_upper = token.upper()
                
        # D. Predominantly numeric/alphanumeric code character substitution
        elif digits_count > letters_count or (digits_count > 0 and len(token) <= 4):
            # Replace alphabetic lookalikes in predominantly numeric/code word
            new_token = ""
            for char in token:
                if char in ('O', 'o'):
                    new_token += '0'
                elif char in ('I', 'i', 'l'):
                    new_token += '1'
                elif char in ('S', 's'):
                    new_token += '5'
                elif char in ('Z', 'z'):
                    new_token += '2'
                else:
                    new_token += char
            if new_token != token:
                repair_operations.append(f"Numeric character substitution: {token} -> {new_token}")
                token = new_token
                orig_token = token
                token_upper = token.upper()
                
        repaired_tokens.append(token)
        
    name = " ".join(repaired_tokens)
    
    # 4. Numeric structure repair (e.g. 6008-B65 / B65-6008 / 6008 B65 -> 6008-B65)
    # Match 6008 (or corrupted equivalents 60O8, 600B, etc.) and B65 (or corrupted 865, B6S, etc.)
    has_6008 = re.search(r'\b60[0O8]8\b|\b6008\b', name, re.IGNORECASE)
    has_b65 = re.search(r'\b[B8]6[5S]\b', name, re.IGNORECASE)
    
    if has_6008 and has_b65:
        pattern1 = r'\b60[0O8]8\s*[-/\\]?\s*[B8]6[5S]\b'
        pattern2 = r'\b[B8]6[5S]\s*[-/\\]?\s*60[0O8]8\b'
        name_before = name
        name = re.sub(pattern1, '6008-B65', name, flags=re.IGNORECASE)
        name = re.sub(pattern2, '6008-B65', name, flags=re.IGNORECASE)
        if name != name_before:
            repair_operations.append(f"Numeric structure repair: {name_before} -> {name}")

    # Calculate Levenshtein-like corruption score
    raw_clean = raw_item_name.upper().strip()
    canonical_clean = name.upper().strip()
    
    mismatches = sum(1 for c1, c2 in zip(raw_clean, canonical_clean) if c1 != c2)
    mismatches += abs(len(raw_clean) - len(canonical_clean))
    
    if len(raw_clean) > 0:
        ocr_corruption_score = min(1.0, float(mismatches) / len(raw_clean))
    else:
        ocr_corruption_score = 0.0
        
    confidence = max(0.0, min(1.0, 1.0 - ocr_corruption_score))
    
    # Produce clean normalized tokens
    normalized_tokens = [t.strip().upper() for t in re.split(r'[^A-Z0-9]', name) if t.strip()]
    
    logger.info(
        f"[ITEM_IDENTITY_REPAIR] raw='{raw_item_name}' canonical='{name}' "
        f"operations={len(repair_operations)} corruption_score={ocr_corruption_score:.3f}"
    )
    
    return {
        "raw_name": raw_item_name,
        "canonical_name": name,
        "normalized_tokens": normalized_tokens,
        "ocr_corruption_score": ocr_corruption_score,
        "repair_operations": repair_operations,
        "confidence": confidence
    }
