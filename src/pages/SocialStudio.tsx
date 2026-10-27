import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Eye,
  Instagram,
  Loader2,
  MousePointerClick,
  Pin,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { cancelSocialPost, fetchSocialPosts, retrySocialPost } from "@/lib/socialApi";
import { formatSocialSlot, nextSocialSlot } from "@shared/social/schedule";
import type { SocialPostView, SocialStatus } from "@shared/social/types";

const scheduleSummary = [
  {
    platform: "Instagram",
    cadence: "3 posts per week",
    slots: "Mon, Wed, Fri at 12:00",
    icon: Instagram,
    accent: "text-pink-400",
  },
  {
    platform: "Pinterest",
    cadence: "12 posts per week",
    slots: "Mon, Wed, Fri, Sun at 09:00, 12:00, 20:00",
    icon: Pin,
    accent: "text-red-400",
  },
] as const;

const STATUS_LABEL: Record<SocialStatus, string> = {
  pending: "Scheduled",
  posting: "Posting",
  posted: "Published",
  failed: "Failed",
  needs_review: "Needs review",
  cancelled: "Cancelled",
};

const STATUS_CLASS: Record<SocialStatus, string> = {
  pending: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
  posting: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  posted: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  failed: "border-red-500/30 bg-red-500/10 text-red-300",
  needs_review: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  cancelled: "border-zinc-700 bg-zinc-800/60 text-zinc-400",
};

function PlatformBadge({ platform }: { platform: SocialPostView["platform"] }) {
  return platform === "instagram" ? (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-pink-300">
      <Instagram className="w-3.5 h-3.5" />
      Instagram
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-red-300">
      <Pin className="w-3.5 h-3.5" />
      Pinterest
    </span>
  );
}

function Preview({ post }: { post: SocialPostView }) {
  const preview = post.share?.thumb_url || post.share?.image_url || post.image_url;
  return preview ? (
    <img
      src={preview}
      alt={post.share?.city_name ?? "Artwork"}
      className="w-14 h-14 rounded-lg object-cover border border-zinc-800 bg-zinc-900 shrink-0"
    />
  ) : (
    <div className="w-14 h-14 rounded-lg border border-zinc-800 bg-zinc-900 flex items-center justify-center shrink-0">
      <Sparkles className="w-4 h-4 text-zinc-600" />
    </div>
  );
}

function PostRow({
  post,
  busy,
  onDetails,
  onCancel,
  onRetry,
}: {
  post: SocialPostView;
  busy: boolean;
  onDetails: (post: SocialPostView) => void;
  onCancel: (post: SocialPostView) => void;
  onRetry: (post: SocialPostView) => void;
}) {
  const city = post.share?.city_name ?? "Untitled artwork";
  const canCancel = post.status === "pending" || post.status === "posting";
  const canRetry = post.status === "failed" || post.status === "needs_review";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 sm:flex-row sm:items-center">
      <Preview post={post} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="truncate text-sm font-semibold text-zinc-100">{city}</p>
          <PlatformBadge platform={post.platform} />
          <Badge variant="outline" className={STATUS_CLASS[post.status]}>
            {post.status === "posting" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            {STATUS_LABEL[post.status]}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" />
            {formatSocialSlot(post.scheduled_at)}
          </span>
          {post.posted_at && <span>Published {formatSocialSlot(post.posted_at)}</span>}
          {post.click_count > 0 && (
            <span className="inline-flex items-center gap-1 text-zinc-400">
              <MousePointerClick className="h-3.5 w-3.5" />
              {post.click_count} {post.click_count === 1 ? "click" : "clicks"}
            </span>
          )}
          {post.attempts > 0 && post.status !== "posted" && (
            <span className="text-zinc-600">{post.attempts} attempts</span>
          )}
        </div>
        {post.last_error && (post.status === "failed" || post.status === "needs_review") && (
          <p className="line-clamp-2 text-xs text-amber-400/80">{post.last_error}</p>
        )}
      </div>

      <div className="flex items-center gap-1.5 self-end sm:self-center">
        {post.external_url && (
          <Button asChild variant="ghost" size="sm" className="text-zinc-400 hover:text-white">
            <a href={post.external_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only">View</span>
            </a>
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDetails(post)}
          className="text-zinc-400 hover:text-white"
        >
          <Eye className="h-3.5 w-3.5" />
          <span className="sr-only sm:not-sr-only">Copy</span>
        </Button>
        {canRetry && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onRetry(post)}
            className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
            Retry
          </Button>
        )}
        {canCancel && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onCancel(post)}
            className="text-zinc-500 hover:bg-red-500/10 hover:text-red-300"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10">
        <Sparkles className="h-5 w-5 text-indigo-400" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-zinc-200">{title}</p>
        <p className="mx-auto max-w-sm text-xs text-zinc-500">{body}</p>
      </div>
      {action}
    </div>
  );
}

function PostDetails({
  post,
  onOpenChange,
}: {
  post: SocialPostView | null;
  onOpenChange: (open: boolean) => void;
}) {
  const copy = post?.title || post?.caption || "";
  return (
    <Dialog open={Boolean(post)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{post?.share?.city_name ?? "Post copy"}</DialogTitle>
          <DialogDescription className="text-zinc-500">
            {post ? `${STATUS_LABEL[post.status]} · ${formatSocialSlot(post.scheduled_at)}` : ""}
          </DialogDescription>
        </DialogHeader>
        {post && (
          <div className="space-y-5 text-sm">
            <div>
              <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">Platform</p>
              <PlatformBadge platform={post.platform} />
            </div>
            {post.title && (
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">Title</p>
                <p className="text-zinc-200">{post.title}</p>
              </div>
            )}
            <div>
              <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                {post.platform === "instagram" ? "Caption" : "Description"}
              </p>
              <p className="whitespace-pre-wrap text-zinc-300">{copy}</p>
            </div>
            {post.alt_text && (
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">Alt text</p>
                <p className="text-zinc-400">{post.alt_text}</p>
              </div>
            )}
            {post.link_url && (
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">Link</p>
                <a
                  href={post.link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-indigo-400 hover:text-indigo-300"
                >
                  {post.link_url}
                </a>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export const SocialStudio = () => {
  const [posts, setPosts] = useState<SocialPostView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [details, setDetails] = useState<SocialPostView | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setRefreshing(true);
    try {
      setPosts(await fetchSocialPosts());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load social posts");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
    const channel = supabase
      .channel("social-studio-posts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "social_posts" },
        () => void load(true),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const groups = useMemo(() => {
    const queue = posts.filter((post) => post.status === "pending" || post.status === "posting");
    const published = posts.filter((post) => post.status === "posted");
    const attention = posts.filter(
      (post) => post.status === "failed" || post.status === "needs_review",
    );
    return { queue, published, attention };
  }, [posts]);

  const totalClicks = useMemo(
    () => posts.reduce((sum, post) => sum + post.click_count, 0),
    [posts],
  );

  const nextSlots = useMemo(() => {
    const now = new Date();
    return {
      instagram: nextSocialSlot("instagram", now),
      pinterest: nextSocialSlot("pinterest", now),
    };
  }, []);

  const handleCancel = async (post: SocialPostView) => {
    setBusyId(post.id);
    try {
      await cancelSocialPost(post.id);
      toast.success("Post cancelled");
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel post");
    } finally {
      setBusyId(null);
    }
  };

  const handleRetry = async (post: SocialPostView) => {
    setBusyId(post.id);
    try {
      await retrySocialPost(post.id);
      toast.success("Post queued for retry");
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not retry post");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <Header />
        <main className="mx-auto max-w-7xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
          <Skeleton className="h-10 w-64 bg-zinc-900" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-28 bg-zinc-900" />
            <Skeleton className="h-28 bg-zinc-900" />
          </div>
          <Skeleton className="h-72 bg-zinc-900" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Header />
      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                Social Studio
              </h1>
              <Badge
                variant="outline"
                className="border-indigo-500/30 bg-indigo-500/10 text-indigo-300"
              >
                Admin
              </Badge>
            </div>
            <p className="text-sm text-zinc-400">
              Queue artwork, review scheduled posts, and publish to Instagram and Pinterest
              automatically.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              Africa/Casablanca
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={refreshing}
              className="border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Scheduled</p>
                <p className="mt-1 text-2xl font-semibold text-zinc-100">{groups.queue.length}</p>
              </div>
              <CalendarClock className="h-5 w-5 text-indigo-400" />
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Published</p>
                <p className="mt-1 text-2xl font-semibold text-zinc-100">
                  {groups.published.length}
                </p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            </CardContent>
          </Card>
          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Shop clicks</p>
                <p className="mt-1 text-2xl font-semibold text-zinc-100">{totalClicks}</p>
              </div>
              <MousePointerClick className="h-5 w-5 text-sky-400" />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {scheduleSummary.map((item) => (
            <Card key={item.platform} className="border-zinc-800 bg-zinc-900/60">
              <CardContent className="flex items-start justify-between gap-4 p-5">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <item.icon className={`h-4 w-4 ${item.accent}`} />
                    <p className="text-sm font-semibold text-zinc-100">{item.platform}</p>
                  </div>
                  <p className="text-xs text-zinc-400">
                    {item.cadence} · {item.slots}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Next slot:{" "}
                    {formatSocialSlot(
                      item.platform === "Instagram" ? nextSlots.instagram : nextSlots.pinterest,
                    )}
                  </p>
                </div>
                <item.icon className={`mt-1 h-5 w-5 opacity-20 ${item.accent}`} />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-zinc-800 bg-zinc-900/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-zinc-100">Post pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="queue" className="space-y-4">
              <TabsList className="border border-zinc-800 bg-zinc-900">
                <TabsTrigger value="queue">Queue ({groups.queue.length})</TabsTrigger>
                <TabsTrigger value="published">Published ({groups.published.length})</TabsTrigger>
                <TabsTrigger value="failed">
                  Needs attention ({groups.attention.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="queue" className="space-y-2">
                {groups.queue.length === 0 ? (
                  <EmptyState
                    title="No scheduled posts yet"
                    body="Generate an artwork, then use Publish & schedule to add it to the Instagram and Pinterest queues."
                    action={
                      <Button
                        asChild
                        size="sm"
                        className="bg-indigo-600 text-white hover:bg-indigo-500"
                      >
                        <Link to="/">Create artwork</Link>
                      </Button>
                    }
                  />
                ) : (
                  groups.queue.map((post) => (
                    <PostRow
                      key={post.id}
                      post={post}
                      busy={busyId === post.id}
                      onDetails={setDetails}
                      onCancel={(item) => void handleCancel(item)}
                      onRetry={(item) => void handleRetry(item)}
                    />
                  ))
                )}
              </TabsContent>

              <TabsContent value="published" className="space-y-2">
                {groups.published.length === 0 ? (
                  <EmptyState
                    title="Nothing published yet"
                    body="Published posts and their live links will appear here after the worker runs."
                  />
                ) : (
                  groups.published.map((post) => (
                    <PostRow
                      key={post.id}
                      post={post}
                      busy={busyId === post.id}
                      onDetails={setDetails}
                      onCancel={(item) => void handleCancel(item)}
                      onRetry={(item) => void handleRetry(item)}
                    />
                  ))
                )}
              </TabsContent>

              <TabsContent value="failed" className="space-y-2">
                {groups.attention.length === 0 ? (
                  <EmptyState
                    title="Nothing needs attention"
                    body="Failed posts retry automatically before being flagged here."
                  />
                ) : (
                  groups.attention.map((post) => (
                    <PostRow
                      key={post.id}
                      post={post}
                      busy={busyId === post.id}
                      onDetails={setDetails}
                      onCancel={(item) => void handleCancel(item)}
                      onRetry={(item) => void handleRetry(item)}
                    />
                  ))
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="flex items-center gap-2 text-xs text-zinc-600">
          <TriangleAlert className="h-3.5 w-3.5" />
          Posts are published by the background worker every five minutes. Failed posts retry
          automatically before being flagged for review.
        </p>
      </main>
      <PostDetails post={details} onOpenChange={(open) => !open && setDetails(null)} />
    </div>
  );
};
