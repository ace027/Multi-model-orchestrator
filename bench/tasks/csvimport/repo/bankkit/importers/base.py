from dataclasses import dataclass, field

from bankkit.models import Transaction


@dataclass(frozen=True)
class RowError:
    line: int  # 1-based line number in the imported file
    message: str


@dataclass
class ImportResult:
    added: list[Transaction] = field(default_factory=list)
    duplicates: int = 0
    errors: list[RowError] = field(default_factory=list)


def normalize_description(text: str) -> str:
    """Trims and collapses runs of whitespace to one space."""
    return " ".join(text.split())
