export interface PaginationQuery {
  page?: unknown;
  limit?: unknown;
  take?: unknown;
  skip?: unknown;
}

export interface Pagination {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginationOptions {
  defaultLimit?: number;
  maxLimit?: number;
}

/**
 * Accepts both `page`/`limit` and the legacy `take`/`skip` conventions so
 * modules can be migrated without changing client contracts.
 */
export function resolvePagination(
  query: PaginationQuery,
  options: PaginationOptions = {},
): Pagination {
  const defaultLimit = options.defaultLimit ?? 20;
  const maxLimit = options.maxLimit ?? 100;

  const rawLimit = query.limit ?? query.take;
  const rawPage = query.page;

  const parsedLimit = Number(rawLimit);
  const parsedPage = Number(rawPage);

  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(Math.trunc(parsedLimit), maxLimit)
      : defaultLimit;

  let skip = 0;

  if (query.skip !== undefined) {
    const parsedSkip = Number(query.skip);
    if (Number.isFinite(parsedSkip) && parsedSkip >= 0) {
      skip = Math.trunc(parsedSkip);
    }
  }

  let page = 1;

  if (Number.isFinite(parsedPage) && parsedPage > 0) {
    page = Math.trunc(parsedPage);
    if (query.skip === undefined) {
      skip = (page - 1) * limit;
    }
  } else if (skip > 0) {
    page = Math.floor(skip / limit) + 1;
  }

  return { page, limit, skip };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export function buildPaginationMeta(
  pagination: Pagination,
  total: number,
): PaginationMeta {
  return {
    page: pagination.page,
    limit: pagination.limit,
    total,
    pages: Math.max(1, Math.ceil(total / pagination.limit)),
  };
}
