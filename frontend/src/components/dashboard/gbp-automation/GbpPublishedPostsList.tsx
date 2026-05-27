import type {
  GbpPublishedLocalPost,
  GbpPublishedLocalPostInput,
} from "../../../api/gbpAutomation";
import { GbpPublishedLocalPostCard } from "./GbpPublishedLocalPostCard";
import { GbpPostsPagination } from "./GbpPostsPagination";

export type GbpPublishedPostsListProps = {
  posts: GbpPublishedLocalPost[];
  pagination?: { page: number; limit: number; total: number; totalPages: number };
  isBusy: boolean;
  isLoading: boolean;
  canPage: boolean;
  onPageChange?: (page: number) => void;
  onSave?: (input: GbpPublishedLocalPostInput) => void | Promise<unknown>;
  onDelete?: (name: string) => void | Promise<unknown>;
  onUploadImage: (file: File) => Promise<string>;
};

export function GbpPublishedPostsList({
  posts,
  pagination,
  isBusy,
  isLoading,
  canPage,
  onPageChange,
  onSave,
  onDelete,
  onUploadImage,
}: GbpPublishedPostsListProps) {
  if (isLoading) {
    return (
      <>
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="h-40 animate-pulse rounded-[12px] border border-slate-200 bg-slate-50" />
        ))}
      </>
    );
  }

  if (posts.length === 0 || !onSave || !onDelete) {
    return (
      <p className="rounded-[10px] bg-slate-50 p-3 text-sm font-bold text-slate-500">
        No synced GBP posts for this location yet. Run Manual posts sync from Settings.
      </p>
    );
  }

  return (
    <>
      {posts.map((post) => (
        <GbpPublishedLocalPostCard
          key={post.name}
          post={post}
          isBusy={isBusy}
          onSave={onSave}
          onDelete={onDelete}
          onUploadImage={onUploadImage}
        />
      ))}
      {pagination && onPageChange && (
        <GbpPostsPagination
          page={pagination.page}
          total={pagination.total}
          totalPages={pagination.totalPages}
          isDisabled={!canPage}
          onPageChange={onPageChange}
        />
      )}
    </>
  );
}
