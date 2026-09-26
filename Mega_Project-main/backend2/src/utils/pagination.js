/**
 * Parse page and limit from express request query object.
 * @param {Object} query - req.query object
 * @param {number} defaultLimit - Default limit (default: 10)
 * @param {number} maxLimit - Maximum allowed limit (default: 100)
 * @returns {{ page: number, limit: number, skip: number }}
 */
const getPaginationParams = (query = {}, defaultLimit = 10, maxLimit = 100) => {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);

  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;

  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

/**
 * Format pagination response metadata and documents array.
 * @param {Object} params
 * @param {Array} params.docs - Array of items for current page
 * @param {number} params.totalDocs - Total count of documents matching filter
 * @param {number} params.page - Current page number
 * @param {number} params.limit - Limit per page
 * @returns {Object} Structured paginated result
 */
const formatPaginatedResult = ({ docs = [], totalDocs = 0, page = 1, limit = 10 }) => {
  const totalPages = Math.ceil(totalDocs / limit) || 1;
  const hasPrevPage = page > 1;
  const hasNextPage = page < totalPages;

  return {
    docs,
    totalDocs,
    limit,
    page,
    totalPages,
    hasPrevPage,
    hasNextPage,
    prevPage: hasPrevPage ? page - 1 : null,
    nextPage: hasNextPage ? page + 1 : null,
  };
};

export { getPaginationParams, formatPaginatedResult };
