import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, CheckCircle2, Instagram, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { formatSocialSlot, nextSocialSlot } from "@shared/social/schedule";

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
    icon: CalendarClock,
    accent: "text-red-400",
  },
];

const EmptyQueue = () => (
  <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
    <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
      <Sparkles className="w-5 h-5 text-indigo-400" />
    </div>
    <div className="space-y-1">
      <p className="text-sm font-medium text-zinc-200">No scheduled posts yet</p>
      <p className="text-xs text-zinc-500 max-w-sm">
        Generate an artwork, then use Publish &amp; schedule to add it to the Instagram and Pinterest queues.
      </p>
    </div>
    <Button asChild size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white">
      <Link to="/">Create artwork</Link>
    </Button>
  </div>
);

export const SocialStudio = () => {
  const nextSlots = useMemo(() => {
    const now = new Date();
    return {
      instagram: nextSocialSlot("instagram", now),
      pinterest: nextSocialSlot("pinterest", now),
    };
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Header />
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-display">Social Studio</h1>
              <Badge variant="outline" className="border-indigo-500/30 text-indigo-300 bg-indigo-500/10">
                Admin
              </Badge>
            </div>
            <p className="text-sm text-zinc-400">
              Queue artwork, review scheduled posts, and publish to Instagram and Pinterest automatically.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Africa/Casablanca
            </span>
            <span className="text-zinc-700">·</span>
            <span>One post per platform</span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {scheduleSummary.map((item) => (
            <Card key={item.platform} className="border-zinc-800 bg-zinc-900/60">
              <CardContent className="p-5 flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <item.icon className={`w-4 h-4 ${item.accent}`} />
                    <p className="text-sm font-semibold text-zinc-100">{item.platform}</p>
                  </div>
                  <p className="text-xs text-zinc-400">{item.cadence} · {item.slots}</p>
                  <p className="text-xs text-zinc-500">
                    Next slot: {formatSocialSlot(item.platform === "Instagram" ? nextSlots.instagram : nextSlots.pinterest)}
                  </p>
                </div>
                <Loader2 className="w-4 h-4 text-zinc-700" />
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
              <TabsList className="bg-zinc-900 border border-zinc-800">
                <TabsTrigger value="queue">Queue</TabsTrigger>
                <TabsTrigger value="published">Published</TabsTrigger>
                <TabsTrigger value="failed">Needs attention</TabsTrigger>
              </TabsList>
              <TabsContent value="queue">
                <EmptyQueue />
              </TabsContent>
              <TabsContent value="published">
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <p className="text-sm text-zinc-400">No published posts yet.</p>
                </div>
              </TabsContent>
              <TabsContent value="failed">
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <TriangleAlert className="w-5 h-5 text-amber-400" />
                  <p className="text-sm text-zinc-400">Nothing needs attention.</p>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-xs text-zinc-600">
          Posts are published by the background worker every five minutes. Failed posts retry automatically before
          being flagged for review.
        </p>
      </main>
    </div>
  );
};
