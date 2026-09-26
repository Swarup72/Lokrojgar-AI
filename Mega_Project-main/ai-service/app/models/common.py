from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AIBaseModel(BaseModel):
    """Base class for every AI-service model.

    populate_by_name=True lets a model be built either from its Python
    (snake_case) field name or from the backend's (camelCase) alias, so the
    same class can validate raw JSON coming straight from the Node API.
    """

    model_config = ConfigDict(populate_by_name=True)


class GeoPoint(AIBaseModel):
    """Mirrors the backend's GeoJSON Point: { type: "Point", coordinates: [lng, lat] }.

    GeoJSON order is [longitude, latitude] - the opposite of the more common
    "lat, lng" spoken convention. This model never reorders the values; it
    only validates them and exposes named `.longitude` / `.latitude`
    properties so calling code never has to guess which index is which.
    """

    type: Literal["Point"] = "Point"
    coordinates: list[float]

    @field_validator("coordinates")
    @classmethod
    def check_coordinates(cls, value: list[float]) -> list[float]:
        if len(value) != 2:
            raise ValueError(
                "coordinates must contain exactly two values: [longitude, latitude]"
            )
        longitude, latitude = value
        if not (-180 <= longitude <= 180):
            raise ValueError(f"longitude {longitude} is out of range (-180 to 180)")
        if not (-90 <= latitude <= 90):
            raise ValueError(f"latitude {latitude} is out of range (-90 to 90)")
        return value

    @property
    def longitude(self) -> float:
        return self.coordinates[0]

    @property
    def latitude(self) -> float:
        return self.coordinates[1]


class MultilingualText(AIBaseModel):
    """Per-language text where each language is optional.

    Matches backend fields such as Job.title / Job.description, where each
    of mr/hi/en individually defaults to null.
    """

    mr: Optional[str] = None
    hi: Optional[str] = None
    en: Optional[str] = None


class MultilingualName(AIBaseModel):
    """Per-language text where every language is required.

    Matches backend fields such as Skill.name, where mr/hi/en are all
    `required: true` in the Mongoose schema.
    """

    mr: str
    hi: str
    en: str
