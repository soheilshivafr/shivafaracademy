import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Smartphone, Upload, Trash2, Download, CheckCircle2, AlertCircle, Info, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface ApkInfo {
  type: "apk" | "zip" | null;
  available: boolean;
  sizeBytes: number;
  sizeMb: number;
  filename: string;
  updatedAt?: string;
}

export default function AndroidApk() {
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const { data: info, isLoading } = useQuery<ApkInfo>({
    queryKey: ["/api/download/android/info"],
    queryFn: async () => {
      const res = await fetch("/api/download/android/info");
      return res.json();
    },
    refetchInterval: 10_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/download/apk", {
        method: "DELETE",
        headers: authHeaders(token),
      });
      if (!res.ok) throw new Error("حذف ناموفق");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "APK حذف شد", description: "اکنون پروژه ZIP در دسترس است" });
      qc.invalidateQueries({ queryKey: ["/api/download/android/info"] });
    },
    onError: (e: Error) => toast({ title: "خطا", description: e.message, variant: "destructive" }),
  });

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".apk")) {
      toast({ title: "فرمت نادرست", description: "فقط فایل‌های APK قابل آپلود هستند", variant: "destructive" });
      return;
    }

    setUploading(true);
    setProgress(0);
    const form = new FormData();
    form.append("apk", file);

    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (ev) => {
      if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
    });

    xhr.addEventListener("load", () => {
      setUploading(false);
      setProgress(0);
      if (xhr.status === 200) {
        toast({ title: "APK آپلود شد ✅", description: "کاربران می‌توانند اپلیکیشن را دانلود کنند" });
        qc.invalidateQueries({ queryKey: ["/api/download/android/info"] });
      } else {
        toast({ title: "خطا در آپلود", description: "لطفاً دوباره امتحان کنید", variant: "destructive" });
      }
      if (fileRef.current) fileRef.current.value = "";
    });

    xhr.addEventListener("error", () => {
      setUploading(false);
      setProgress(0);
      toast({ title: "خطا در اتصال", description: "لطفاً دوباره امتحان کنید", variant: "destructive" });
    });

    xhr.open("POST", "/api/admin/download/upload-apk");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(form);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6" dir="rtl">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Smartphone className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">مدیریت APK اندروید</h1>
          <p className="text-sm text-muted-foreground">آپلود و مدیریت اپلیکیشن اندروید</p>
        </div>
      </div>

      {/* Current Status Card */}
      <div className="bg-card border border-border rounded-2xl p-5 mb-5">
        <h2 className="font-bold text-foreground mb-4">وضعیت فعلی</h2>
        {isLoading ? (
          <div className="animate-pulse h-12 bg-muted rounded-xl" />
        ) : info?.available ? (
          <div className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${info.type === "apk" ? "bg-green-500/10" : "bg-blue-500/10"}`}>
              {info.type === "apk" ? (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              ) : (
                <Package className="w-5 h-5 text-blue-500" />
              )}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground text-sm">
                {info.type === "apk" ? "✅ APK آماده دانلود" : "📦 پروژه ZIP (نیاز به Build)"}
              </p>
              <p className="text-xs text-muted-foreground">
                {info.filename} — {info.sizeMb} MB
                {info.updatedAt && ` — ${new Date(info.updatedAt).toLocaleDateString("fa-IR")}`}
              </p>
            </div>
            <a
              href="/api/download/android"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors"
              download
            >
              <Download className="w-3.5 h-3.5" />
              دانلود
            </a>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-muted-foreground">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span className="text-sm">هیچ فایلی در دسترس نیست</span>
          </div>
        )}
      </div>

      {/* Upload Section */}
      <div className="bg-card border border-border rounded-2xl p-5 mb-5">
        <h2 className="font-bold text-foreground mb-1">آپلود APK جدید</h2>
        <p className="text-xs text-muted-foreground mb-4">
          فایل APK کامپایل شده را آپلود کنید. حداکثر حجم: ۲۰۰ مگابایت
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".apk"
          onChange={handleUpload}
          disabled={uploading}
          className="hidden"
        />

        {uploading ? (
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-2">
              <span>در حال آپلود...</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full h-12 border-2 border-dashed border-border rounded-xl flex items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            <Upload className="w-5 h-5" />
            <span className="font-medium">کلیک برای انتخاب فایل APK</span>
          </button>
        )}
      </div>

      {/* Delete APK */}
      {info?.type === "apk" && (
        <div className="bg-card border border-border rounded-2xl p-5 mb-5">
          <h2 className="font-bold text-foreground mb-1">حذف APK</h2>
          <p className="text-xs text-muted-foreground mb-4">
            با حذف APK، پروژه ZIP (برای دولوپر) به عنوان دانلود پیش‌فرض برمی‌گردد
          </p>
          <button
            onClick={() => {
              if (confirm("مطمئنید؟ APK حذف می‌شود")) deleteMutation.mutate();
            }}
            disabled={deleteMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 text-sm font-bold transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            حذف APK
          </button>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-4 h-4 text-blue-400" />
          <span className="font-bold text-sm text-blue-400">راهنمای Build پروژه اندروید</span>
        </div>
        <ol className="space-y-2 text-xs text-muted-foreground list-decimal list-inside">
          <li>پروژه ZIP را دانلود کنید</li>
          <li>در Android Studio باز کنید</li>
          <li>فایل <code className="bg-muted px-1 rounded">strings.xml</code> را ویرایش و <code className="bg-muted px-1 rounded">YOUR_DOMAIN</code> را با دامنه واقعی جایگزین کنید</li>
          <li>keystore موجود در پروژه را کپی کنید (رمز: <code className="bg-muted px-1 rounded">ShivafarAcademy2024!</code>)</li>
          <li>Build &gt; Generate Signed APK &gt; Release را اجرا کنید</li>
          <li>APK خروجی را از همین صفحه آپلود کنید</li>
        </ol>
      </div>
    </div>
  );
}
