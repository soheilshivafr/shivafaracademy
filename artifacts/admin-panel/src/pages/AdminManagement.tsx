import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, put, del } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, ShieldCheck, User } from "lucide-react";

interface AdminUser {
  id: number;
  username: string;
  isSuperAdmin: boolean;
  permissions: string[];
  createdAt: string;
}

const ALL_PERMISSIONS: { key: string; label: string }[] = [
  { key: "dashboard", label: "داشبورد" },
  { key: "courses", label: "دوره‌ها" },
  { key: "mtp-pricing", label: "قیمت و تخفیف MTP" },
  { key: "products", label: "محصولات" },
  { key: "reels", label: "ریلز" },
  { key: "channel", label: "کانال" },
  { key: "users", label: "کاربران" },
  { key: "advisor-requests", label: "درخواست مشاور" },
  { key: "orders", label: "تراکنش‌ها" },
  { key: "licenses", label: "لایسنس‌ها" },
  { key: "chatbot", label: "پایگاه دانش (قدیم)" },
  { key: "knowledge-base", label: "پایگاه دانش KB" },
  { key: "pages-content", label: "محتوای صفحات معرفی" },
  { key: "voice-advisor-logs", label: "مکالمات سارا" },
  { key: "proactive-messages", label: "پیام‌های پیشگیرانه" },
  { key: "support-agents", label: "پشتیبان‌های چت" },
  { key: "campaigns", label: "کمپین‌های جدول" },
  { key: "tracking-links", label: "لینک‌های تبلیغاتی" },
  { key: "financial-reports", label: "گزارش درآمد و هزینه" },
  { key: "push-notification", label: "پیام مستقیم" },
  { key: "android-apk", label: "APK اندروید" },
  { key: "settings", label: "تنظیمات" },
  { key: "system-status", label: "وضعیت سیستم" },
];

interface AdminFormState {
  username: string;
  password: string;
  permissions: string[];
}

const defaultForm = (): AdminFormState => ({
  username: "",
  password: "",
  permissions: [],
});

export default function AdminManagement() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editAdmin, setEditAdmin] = useState<AdminUser | null>(null);
  const [deleteAdmin, setDeleteAdmin] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<AdminFormState>(defaultForm());

  const { data: admins, isLoading } = useQuery<AdminUser[]>({
    queryKey: ["admin-admins"],
    queryFn: () => get<AdminUser[]>("/admin/admins"),
  });

  const createMutation = useMutation({
    mutationFn: (data: AdminFormState) =>
      post<AdminUser>("/admin/admins", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-admins"] });
      toast({ title: "ادمین جدید با موفقیت ایجاد شد" });
      setCreateOpen(false);
      setForm(defaultForm());
    },
    onError: (e: any) => {
      toast({ title: "خطا", description: e.message, variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<AdminFormState> }) =>
      put<AdminUser>(`/admin/admins/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-admins"] });
      toast({ title: "ادمین با موفقیت ویرایش شد" });
      setEditAdmin(null);
      setForm(defaultForm());
    },
    onError: (e: any) => {
      toast({ title: "خطا", description: e.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => del<{ message: string }>(`/admin/admins/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-admins"] });
      toast({ title: "ادمین با موفقیت حذف شد" });
      setDeleteAdmin(null);
    },
    onError: (e: any) => {
      toast({ title: "خطا", description: e.message, variant: "destructive" });
    },
  });

  function openCreate() {
    setForm(defaultForm());
    setCreateOpen(true);
  }

  function openEdit(admin: AdminUser) {
    setForm({ username: admin.username, password: "", permissions: [...admin.permissions] });
    setEditAdmin(admin);
  }

  function togglePermission(key: string) {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter((p) => p !== key)
        : [...f.permissions, key],
    }));
  }

  function handleCreate() {
    createMutation.mutate(form);
  }

  function handleEdit() {
    if (!editAdmin) return;
    const payload: Partial<AdminFormState> = {
      permissions: form.permissions,
      username: form.username,
    };
    if (form.password) payload.password = form.password;
    editMutation.mutate({ id: editAdmin.id, data: payload });
  }

  const selectAll = () => setForm((f) => ({ ...f, permissions: ALL_PERMISSIONS.map((p) => p.key) }));
  const clearAll = () => setForm((f) => ({ ...f, permissions: [] }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">مدیریت ادمین‌ها</h1>
          <p className="text-muted-foreground text-sm mt-1">ساخت ادمین جدید و تنظیم سطح دسترسی</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus size={16} />
          ادمین جدید
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        <div className="grid gap-4">
          {admins?.map((admin) => (
            <Card key={admin.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${admin.isSuperAdmin ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"}`}>
                      {admin.isSuperAdmin ? <ShieldCheck size={20} /> : <User size={20} />}
                    </div>
                    <div>
                      <CardTitle className="text-base">{admin.username}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {admin.isSuperAdmin ? (
                          <Badge variant="secondary" className="text-amber-700 bg-amber-50 border-amber-200">سوپر ادمین</Badge>
                        ) : (
                          <Badge variant="outline">{admin.permissions.length} دسترسی فعال</Badge>
                        )}
                      </p>
                    </div>
                  </div>
                  {!admin.isSuperAdmin && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(admin)} className="gap-1.5">
                        <Pencil size={14} />
                        ویرایش
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteAdmin(admin)}>
                        <Trash2 size={14} />
                        حذف
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              {!admin.isSuperAdmin && admin.permissions.length > 0 && (
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-1.5">
                    {admin.permissions.map((perm) => {
                      const label = ALL_PERMISSIONS.find((p) => p.key === perm)?.label ?? perm;
                      return (
                        <Badge key={perm} variant="secondary" className="text-xs">{label}</Badge>
                      );
                    })}
                  </div>
                </CardContent>
              )}
              {!admin.isSuperAdmin && admin.permissions.length === 0 && (
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground">بدون دسترسی — این ادمین به هیچ بخشی دسترسی ندارد</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ادمین جدید</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>نام کاربری</Label>
                <Input
                  placeholder="مثال: support1"
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label>رمز عبور</Label>
                <Input
                  type="password"
                  placeholder="حداقل ۶ کاراکتر"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  dir="ltr"
                />
              </div>
            </div>

            <PermissionsSection
              permissions={form.permissions}
              onToggle={togglePermission}
              onSelectAll={selectAll}
              onClearAll={clearAll}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>لغو</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "در حال ایجاد..." : "ایجاد ادمین"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editAdmin} onOpenChange={(o) => { if (!o) { setEditAdmin(null); setForm(defaultForm()); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>ویرایش ادمین: {editAdmin?.username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>نام کاربری</Label>
                <Input
                  placeholder="نام کاربری"
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5">
                <Label>رمز عبور جدید <span className="text-muted-foreground text-xs">(اختیاری)</span></Label>
                <Input
                  type="password"
                  placeholder="خالی بگذارید تا تغییر نکند"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  dir="ltr"
                />
              </div>
            </div>

            <PermissionsSection
              permissions={form.permissions}
              onToggle={togglePermission}
              onSelectAll={selectAll}
              onClearAll={clearAll}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditAdmin(null); setForm(defaultForm()); }}>لغو</Button>
            <Button onClick={handleEdit} disabled={editMutation.isPending}>
              {editMutation.isPending ? "در حال ذخیره..." : "ذخیره تغییرات"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteAdmin} onOpenChange={(o) => { if (!o) setDeleteAdmin(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف ادمین</AlertDialogTitle>
            <AlertDialogDescription>
              آیا مطمئن هستید که می‌خواهید ادمین <strong>{deleteAdmin?.username}</strong> را حذف کنید؟ این عمل قابل بازگشت نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>لغو</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteAdmin && deleteMutation.mutate(deleteAdmin.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "در حال حذف..." : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PermissionsSection({
  permissions,
  onToggle,
  onSelectAll,
  onClearAll,
}: {
  permissions: string[];
  onToggle: (key: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-base font-semibold">سطح دسترسی</Label>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onSelectAll}>همه</Button>
          <Button type="button" size="sm" variant="outline" onClick={onClearAll}>هیچکدام</Button>
        </div>
      </div>
      <div className="border rounded-lg p-4 grid grid-cols-2 gap-3">
        {ALL_PERMISSIONS.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2.5 cursor-pointer select-none">
            <Checkbox
              checked={permissions.includes(key)}
              onCheckedChange={() => onToggle(key)}
            />
            <span className="text-sm">{label}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {permissions.length} از {ALL_PERMISSIONS.length} بخش انتخاب شده
      </p>
    </div>
  );
}
