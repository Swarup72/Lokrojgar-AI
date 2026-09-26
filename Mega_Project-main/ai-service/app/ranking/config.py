from pydantic import BaseModel, Field, model_validator


class RankingWeights(BaseModel):
    """
    Weights used to combine the six match factors into one overall score.

    These are baseline IMPLEMENTATION weights for the current AI
    prototype, not a requirement from the project synopsis or the backend
    schema - nothing in models.zip specifies how factors should be
    balanced. Equal weighting is chosen here only because no factor has
    been identified as more important than another yet. Override by
    constructing RankingWeights(...) with different values for
    experimentation.

    Using a Pydantic model (instead of a plain dict) means a weight can
    never be silently missing - every field has a default - and Field(ge=0)
    plus the validator below reject negative or all-zero configurations at
    construction time rather than failing later during ranking.
    """

    skill: float = Field(default=1.0, ge=0)
    location: float = Field(default=1.0, ge=0)
    availability: float = Field(default=1.0, ge=0)
    pay: float = Field(default=1.0, ge=0)
    rating: float = Field(default=1.0, ge=0)
    relevance: float = Field(default=1.0, ge=0)

    @model_validator(mode="after")
    def check_not_all_zero(self) -> "RankingWeights":
        total = (
            self.skill
            + self.location
            + self.availability
            + self.pay
            + self.rating
            + self.relevance
        )
        if total == 0:
            raise ValueError("At least one ranking weight must be greater than zero.")
        return self
