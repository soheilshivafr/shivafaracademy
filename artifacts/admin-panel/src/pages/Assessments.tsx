import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { get, post, put, del } from "@/lib/api";

function apiRequest(path: string, opts?: RequestInit): Promise<unknown> {
  if (!opts || opts.method === "GET" || !opts.method) return get(path);
  if (opts.method === "POST") return post(path, opts.body ? JSON.parse(opts.body as string) : undefined);
  if (opts.method === "PUT") return put(path, opts.body ? JSON.parse(opts.body as string) : undefined);
  if (opts.method === "DELETE") return del(path);
  return get(path);
}

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Pencil, Trash2, Copy, Eye, BarChart2, ToggleLeft, ToggleRight,
  Brain, Users, FileQuestion, Loader2,
} from "lucide-react";

interface Assessment {
  id: number;
  title: string;
  slug: string;
  shortDescription?: string;
  isPublished: boolean;
  participantCount: number;
  questionCount: number;
  leadCount: number;
  hasAiReport: boolean;
  category?: string;
  estimatedMinutes?: number;
  createdAt: string;
}

export default function Assessments() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: items = [], isLoading } = useQuery<Assessment[]>({
    queryKey: ["/admin/assessments"],
    queryFn: () => apiRequest("/admin/assessments"),
  });

  const filtered = items.filter((a) =>
    a.title.toLowerCase().includes(search.toLowerCase()) ||
    a.slug.toLowerCase().includes(search.toLowerCase())
  );

  const toggleMutation = useMutation({
    mutationFn: (a: Assessment) =>
      apiRequest(`/admin/assessments/${a.id}`, {
        method: "PUT",
        body: JSON.stringify({ isPublished: !a.isPublished }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/admin/assessments"] }),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/admin/assessments/${id}/duplicate`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/admin/assessments"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/admin/assessments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/admin/assessments"] });
      setDeleteId(null);
    },
  });

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <Brain className="w-6 h-6 text-primary" />
            Tests & Assessments
          </h1>
          <p className="text-muted-foreground text-sm mt-1">مدیریت تست‌ها و ارزیابی‌های هوشمند</p>
        </div>
        <Link href="/assessments/new">
          <Button className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            تست جدید
          </Button>
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">کل تست‌ها</p>
          <p className="text-2xl font-black text-foreground">{items.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">منتشر شده</p>
          <p className="text-2xl font-black text-green-400">{items.filter((a) => a.isPublished).length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground mb-1">کل شرکت‌کنندگان</p>
          <p className="text-2xl font-black text-primary">
            {items.reduce((s, a) => s + a.participantCount, 0).toLocaleString("fa")}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <Input
          placeholder="جستجو در تست‌ها..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Brain className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>{search ? "تستی با این مشخصات یافت نشد" : "هنوز تستی ایجاد نشده است"}</p>
            {!search && (
              <Link href="/assessments/new">
                <Button size="sm" className="mt-4">اولین تست را بساز</Button>
              </Link>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">عنوان</TableHead>
                <TableHead className="text-right">وضعیت</TableHead>
                <TableHead className="text-right hidden md:table-cell">سوالات</TableHead>
                <TableHead className="text-right hidden md:table-cell">
                  <Users className="w-3.5 h-3.5 inline ml-1" />شرکت‌کنندگان
                </TableHead>
                <TableHead className="text-right hidden lg:table-cell">لیدها</TableHead>
                <TableHead className="text-right hidden lg:table-cell">AI</TableHead>
                <TableHead className="text-right">عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-foreground">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{a.slug}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {a.isPublished ? (
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">منتشر</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">پیش‌نویس</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="flex items-center gap-1 text-sm">
                      <FileQuestion className="w-3.5 h-3.5 text-muted-foreground" />
                      {a.questionCount}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm font-medium">
                    {a.participantCount.toLocaleString("fa")}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">
                    {a.leadCount.toLocaleString("fa")}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {a.hasAiReport ? (
                      <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">فعال</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 flex-wrap">
                      {/* Toggle publish */}
                      <button
                        onClick={() => toggleMutation.mutate(a)}
                        disabled={toggleMutation.isPending}
                        title={a.isPublished ? "غیرفعال کن" : "منتشر کن"}
                        className="p-1.5 rounded hover:bg-muted transition-colors"
                      >
                        {a.isPublished
                          ? <ToggleRight className="w-4 h-4 text-green-400" />
                          : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                      </button>

                      {/* Stats */}
                      <Link href={`/assessments/${a.id}/stats`}>
                        <button title="آمار" className="p-1.5 rounded hover:bg-muted transition-colors">
                          <BarChart2 className="w-4 h-4 text-blue-400" />
                        </button>
                      </Link>

                      {/* Preview */}
                      <a href={`/assessment/${a.slug}`} target="_blank" rel="noopener noreferrer">
                        <button title="پیش‌نمایش" className="p-1.5 rounded hover:bg-muted transition-colors">
                          <Eye className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </a>

                      {/* Edit */}
                      <Link href={`/assessments/${a.id}/edit`}>
                        <button title="ویرایش" className="p-1.5 rounded hover:bg-muted transition-colors">
                          <Pencil className="w-4 h-4 text-muted-foreground" />
                        </button>
                      </Link>

                      {/* Duplicate */}
                      <button
                        onClick={() => duplicateMutation.mutate(a.id)}
                        disabled={duplicateMutation.isPending}
                        title="کپی"
                        className="p-1.5 rounded hover:bg-muted transition-colors"
                      >
                        <Copy className="w-4 h-4 text-muted-foreground" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => setDeleteId(a.id)}
                        title="حذف"
                        className="p-1.5 rounded hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Delete dialog */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف تست</AlertDialogTitle>
            <AlertDialogDescription>
              آیا مطمئن هستید؟ تمام سوالات، شاخص‌ها و نتایج این تست حذف می‌شوند.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-red-500 hover:bg-red-600"
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
