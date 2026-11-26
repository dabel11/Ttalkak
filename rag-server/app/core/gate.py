"""First-turn input validation and retrieval confidence."""
import re
import unicodedata


def is_noise_only(query: str) -> bool:
    """Reject unambiguous noise without requiring vocabulary from the corpus."""
    value = unicodedata.normalize("NFC", query).strip().casefold()
    if not any(c.isalpha() and not ("ㄱ" <= c <= "ㅣ") for c in value):
        return True
    if re.fullmatch(r"(?:https?://|www\.)[^\s]+", value):
        return True
    if re.fullmatch(r"(.)\1{3,}", value):
        return True
    return value.rstrip(" .!?~") in {
        "안녕", "안녕하세요", "ㅎㅇ", "고마워", "테스트", "hello", "hi", "ok",
        "asdf", "asdfasdf", "qwerty", "lorem ipsum dolor sit amet",
    }


def select_examples(examples: list[dict], history: list, minimum: float) -> list[dict]:
    """On the first turn use examples only when retrieval finds a confident match."""
    if history or minimum <= 0:
        return examples
    return [example for example in examples if example.get("score", 0.0) >= minimum]


def rag_status(retrieved: list, examples: list) -> str:
    return "ok" if retrieved or examples else "no_evidence"
