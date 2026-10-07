import mongoose from "mongoose";

/**
 * The shared, OPTIONAL GeoJSON point used by WorkerProfile and EmployerProfile.
 *
 * Location used to be a required inline object on both models, which forced
 * registration to invent a value: every new profile was seeded with Pune
 * city-centre coordinates. Those are real, valid coordinates, so location
 * matching took them at face value - a worker who had never said where they are
 * was scored as if they lived in central Pune.
 *
 * An absent location is now genuinely absent. This is a named sub-schema rather
 * than an inline object because that is what makes `default: undefined` work on
 * the owning path: with an inline object, Mongoose materializes `location` from
 * the nested `type` default and then has to validate a point that was never
 * supplied. (Mongoose 9 also rejects `default: undefined` written inside an
 * inline nested path - it reads it as a field called "default".)
 *
 * Validation is unchanged while a location IS present: a malformed or
 * out-of-range point is still rejected. Only its absence became legal.
 *
 * The models' 2dsphere indexes are unaffected - MongoDB does not index a
 * document that lacks the field, so a profile with no location is simply not a
 * geospatial candidate, which is the correct outcome.
 */
export const geoPointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
    },

    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: function (val) {
          if (!Array.isArray(val) || val.length !== 2) return false;
          const [lng, lat] = val;
          return (
            typeof lng === "number" &&
            typeof lat === "number" &&
            lng >= -180 &&
            lng <= 180 &&
            lat >= -90 &&
            lat <= 90
          );
        },
        message: "Coordinates must be [longitude, latitude] with longitude in [-180, 180] and latitude in [-90, 90].",
      },
    },
  },
  { _id: false }
);

/**
 * Use as:  location: optionalGeoPoint()
 *
 * `default: undefined` is the whole point: the path stays absent until someone
 * actually sets a location, so nothing downstream can mistake a placeholder for
 * a real position.
 */
export const optionalGeoPoint = () => ({
  type: geoPointSchema,
  default: undefined,
});
