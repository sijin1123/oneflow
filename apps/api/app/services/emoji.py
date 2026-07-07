"""Free-emoji validation (expansion PLAN Pass 35 PR-BA, v35.1 R1-①/③).

Accepts EXACTLY ONE emoji grapheme cluster, dependency-free:

    cluster := unit (ZWJ unit)*
    unit    := base [VS16] [skin-tone]
             | keycap  ([0-9#*] VS16? U+20E3)
             | flag    (exactly two regional indicators)

Anything else — ASCII words, whitespace, multiple emoji, lone joiners or
modifiers, extra regional indicators — is rejected. The DB CHECK
(ck_comment_reactions_emoji_shape) is a coarse backstop only; this function
is the single write-path authority (the PUT endpoint is the only writer).
"""

import unicodedata

ZWJ = "\u200d"
VS16 = "\ufe0f"
KEYCAP = "\u20e3"
MAX_LEN = 16

# Base pictographic codepoints (inclusive ranges).
_BASE_RANGES = (
    (0x2600, 0x27BF),  # Misc Symbols / Dingbats
    (0x2B00, 0x2BFF),  # Misc Symbols and Arrows (⬆️ ⭐ …)
    (0x2190, 0x21FF),  # Arrows (↔️ …)
    (0x2300, 0x23FF),  # Misc Technical (⌚ ⏰ …)
    (0x25A0, 0x25FF),  # Geometric shapes (▶️ …)
    (0x2900, 0x297F),  # Supplemental arrows
    (0x1F000, 0x1F0FF),  # Mahjong / cards
    (0x1F100, 0x1F1DF),  # Enclosed alphanumeric supplement (non-RI part)
    (0x1F200, 0x1F2FF),  # Enclosed ideographic supplement
    (0x1F300, 0x1F5FF),  # Misc Symbols and Pictographs
    (0x1F600, 0x1F64F),  # Emoticons
    (0x1F680, 0x1F6FF),  # Transport
    (0x1F700, 0x1F77F),  # Alchemical
    (0x1F900, 0x1F9FF),  # Supplemental Symbols and Pictographs
    (0x1FA00, 0x1FAFF),  # Symbols and Pictographs Extended-A
    (0x2764, 0x2764),  # heavy black heart (inside 2600 range; kept for clarity)
)
_SKIN_TONES = (0x1F3FB, 0x1F3FF)  # inclusive modifier range
_RI_RANGE = (0x1F1E6, 0x1F1FF)  # regional indicators


def _is_base(cp: int) -> bool:
    # Skin tones sit inside the 1F300-1F5FF block — a lone modifier must
    # never pass as a base (R1-(1)).
    if _is_skin_tone(cp):
        return False
    return any(lo <= cp <= hi for lo, hi in _BASE_RANGES)


def _is_skin_tone(cp: int) -> bool:
    return _SKIN_TONES[0] <= cp <= _SKIN_TONES[1]


def _is_ri(cp: int) -> bool:
    return _RI_RANGE[0] <= cp <= _RI_RANGE[1]


def _consume_unit(cps: list[int], i: int) -> int:
    """Return the index after one unit starting at i, or -1 if invalid."""
    n = len(cps)
    cp = cps[i]
    # keycap: [0-9#*] VS16? U+20E3
    if chr(cp) in "0123456789#*":
        j = i + 1
        if j < n and cps[j] == ord(VS16):
            j += 1
        if j < n and cps[j] == ord(KEYCAP):
            return j + 1
        return -1
    # flag: exactly two regional indicators
    if _is_ri(cp):
        if i + 1 < n and _is_ri(cps[i + 1]):
            return i + 2
        return -1
    # base [VS16] [skin-tone]
    if _is_base(cp):
        j = i + 1
        if j < n and cps[j] == ord(VS16):
            j += 1
        if j < n and _is_skin_tone(cps[j]):
            j += 1
        return j
    return -1


def is_single_emoji(value: str) -> bool:
    """True iff `value` is exactly one emoji grapheme cluster."""
    value = unicodedata.normalize("NFC", value)
    if not 1 <= len(value) <= MAX_LEN:
        return False
    cps = [ord(c) for c in value]
    i = _consume_unit(cps, 0)
    if i < 0:
        return False
    while i < len(cps):
        if cps[i] != ord(ZWJ) or i + 1 >= len(cps):
            return False  # leftover without ZWJ, or trailing ZWJ
        i = _consume_unit(cps, i + 1)
        if i < 0:
            return False
    return True


def normalize_emoji(value: str) -> str:
    return unicodedata.normalize("NFC", value)
