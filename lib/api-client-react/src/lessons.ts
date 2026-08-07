import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  MutationFunction,
  QueryFunction,
  QueryKey,
  UseMutationOptions,
  UseMutationResult,
  UseQueryOptions,
  UseQueryResult,
} from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { ErrorType, BodyType } from "./custom-fetch";
import type { Lesson, LessonInput, MessageResponse } from "./generated/api.schemas";

type AwaitedInput<T> = PromiseLike<T> | T;
type Awaited<O> = O extends AwaitedInput<infer T> ? T : never;
type SecondParameter<T extends (...args: never) => unknown> = Parameters<T>[1];

// ─── Admin: list lessons for a course ─────────────────────────────────────

export const adminGetCourseLessons = (courseId: number, options?: RequestInit) =>
  customFetch<Lesson[]>(`/api/admin/courses/${courseId}/lessons`, { ...options, method: "GET" });

export const getAdminGetCourseLessonsQueryKey = (courseId: number) =>
  [`/api/admin/courses/${courseId}/lessons`] as const;

export function useAdminGetCourseLessons<TData = Lesson[], TError = ErrorType<unknown>>(
  courseId: number,
  options?: { query?: UseQueryOptions<Lesson[], TError, TData>; request?: SecondParameter<typeof customFetch> }
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getAdminGetCourseLessonsQueryKey(courseId);
  const queryFn: QueryFunction<Lesson[]> = ({ signal }) =>
    adminGetCourseLessons(courseId, { signal, ...requestOptions });
  const query = useQuery({ queryKey, queryFn, enabled: !!courseId, ...queryOptions }) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  return { ...query, queryKey };
}

// ─── Admin: create lesson ─────────────────────────────────────────────────

export const adminCreateLesson = (courseId: number, data: LessonInput, options?: RequestInit) =>
  customFetch<Lesson>(`/api/admin/courses/${courseId}/lessons`, {
    ...options, method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(data),
  });

export function useAdminCreateLesson<TError = ErrorType<unknown>, TContext = unknown>(
  options?: { mutation?: UseMutationOptions<Lesson, TError, { courseId: number; data: BodyType<LessonInput> }, TContext>; request?: SecondParameter<typeof customFetch> }
): UseMutationResult<Lesson, TError, { courseId: number; data: BodyType<LessonInput> }, TContext> {
  const { mutation: mutationOptions, request: requestOptions } = options ?? {};
  const mutationFn: MutationFunction<Lesson, { courseId: number; data: BodyType<LessonInput> }> = ({ courseId, data }) =>
    adminCreateLesson(courseId, data, requestOptions);
  return useMutation({ mutationFn, ...mutationOptions });
}

// ─── Admin: update lesson ─────────────────────────────────────────────────

export const adminUpdateLesson = (id: number, data: LessonInput, options?: RequestInit) =>
  customFetch<Lesson>(`/api/admin/lessons/${id}`, {
    ...options, method: "PUT",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: JSON.stringify(data),
  });

export function useAdminUpdateLesson<TError = ErrorType<unknown>, TContext = unknown>(
  options?: { mutation?: UseMutationOptions<Lesson, TError, { id: number; data: BodyType<LessonInput> }, TContext>; request?: SecondParameter<typeof customFetch> }
): UseMutationResult<Lesson, TError, { id: number; data: BodyType<LessonInput> }, TContext> {
  const { mutation: mutationOptions, request: requestOptions } = options ?? {};
  const mutationFn: MutationFunction<Lesson, { id: number; data: BodyType<LessonInput> }> = ({ id, data }) =>
    adminUpdateLesson(id, data, requestOptions);
  return useMutation({ mutationFn, ...mutationOptions });
}

// ─── Admin: delete lesson ─────────────────────────────────────────────────

export const adminDeleteLesson = (id: number, options?: RequestInit) =>
  customFetch<MessageResponse>(`/api/admin/lessons/${id}`, { ...options, method: "DELETE" });

export function useAdminDeleteLesson<TError = ErrorType<unknown>, TContext = unknown>(
  options?: { mutation?: UseMutationOptions<MessageResponse, TError, { id: number }, TContext>; request?: SecondParameter<typeof customFetch> }
): UseMutationResult<MessageResponse, TError, { id: number }, TContext> {
  const { mutation: mutationOptions, request: requestOptions } = options ?? {};
  const mutationFn: MutationFunction<MessageResponse, { id: number }> = ({ id }) =>
    adminDeleteLesson(id, requestOptions);
  return useMutation({ mutationFn, ...mutationOptions });
}

// ─── User: get lessons for purchased course ───────────────────────────────

export const getCourseLessons = (courseId: number, options?: RequestInit) =>
  customFetch<Lesson[]>(`/api/courses/${courseId}/lessons`, { ...options, method: "GET" });

export const getGetCourseLessonsQueryKey = (courseId: number) =>
  [`/api/courses/${courseId}/lessons`] as const;

export function useGetCourseLessons<TData = Lesson[], TError = ErrorType<unknown>>(
  courseId: number,
  options?: { query?: UseQueryOptions<Lesson[], TError, TData>; request?: SecondParameter<typeof customFetch> }
): UseQueryResult<TData, TError> & { queryKey: QueryKey } {
  const { query: queryOptions, request: requestOptions } = options ?? {};
  const queryKey = queryOptions?.queryKey ?? getGetCourseLessonsQueryKey(courseId);
  const queryFn: QueryFunction<Lesson[]> = ({ signal }) =>
    getCourseLessons(courseId, { signal, ...requestOptions });
  const query = useQuery({ queryKey, queryFn, enabled: !!courseId, ...queryOptions }) as UseQueryResult<TData, TError> & { queryKey: QueryKey };
  return { ...query, queryKey };
}
