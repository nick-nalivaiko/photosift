from pydantic import BaseModel

class ReferenceMatch(BaseModel):
    reference_id: str
    distance: float
    is_match: bool

class ProcessingResult(BaseModel):
    file_path: str
    status: str
    category: str
    matches: list[ReferenceMatch] = []
    error: str | None = None
