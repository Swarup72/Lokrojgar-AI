/**
 * Map the draft onto the Add Job form's initialValues shape.
 *
 * Only fields the employer actually answered are carried across; an
 * unanswered step stays empty so the form shows a blank the employer fills in,
 * rather than a value nobody supplied. `originalLanguage` is the language they
 * spoke, which is what the backend translates away from.
 */
export function toFormValues(draftFields = {}, spokenLanguage = "mr") {
  const values = { originalLanguage: spokenLanguage };

  if (draftFields.jobTitle) values.title = draftFields.jobTitle;
  if (draftFields.jobDescription) values.description = draftFields.jobDescription;
  if (draftFields.jobCity) values.city = draftFields.jobCity;
  if (typeof draftFields.jobWorkerCount === "number") {
    values.requiredWorkers = draftFields.jobWorkerCount;
  }
  if (typeof draftFields.jobPayAmount === "number") values.payAmount = draftFields.jobPayAmount;
  if (draftFields.jobPayType) values.payType = draftFields.jobPayType;
  if (draftFields.jobStartDate) values.startDate = draftFields.jobStartDate;
  if (draftFields.jobShiftType) values.shiftType = draftFields.jobShiftType;

  // Only skills the backend could resolve to real catalog ids are preselected.
  // An unresolved phrase is deliberately NOT guessed into an id — the employer
  // picks it in the form, where the real catalog is listed.
  const skillIds = draftFields.jobSkills?.skillIds;
  if (Array.isArray(skillIds) && skillIds.length) values.skillIds = skillIds;

  return values;
}
