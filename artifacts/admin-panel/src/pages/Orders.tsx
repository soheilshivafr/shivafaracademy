import { useEffect, useState } from "react";
import { get } from "@/lib/api";
import { Search } from "lucide-react";

interface Order {
  id: number; userId: number; itemType: string; itemId: number;
  amount: number; status: string; transactionId?: string | null;
  createdAt: string; updatedAt: string;
}

function toPersianDate(iso: string) {
  return new Date(iso).toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric" });
}

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    get<Order[]>("/admin/orders").then(data => { setOrders(data); setLoading(false); });
  }, []);

  const filtered = orders.filter(o =>
    String(o.id).includes(search) ||
    String(o.userId).includes(search) ||
    o.status.includes(search) ||
    (o.transactionId ?? "").includes(search)
  );

  const totalPaid = orders.filter(o => o.status === "paid").reduce((s, o) => s + o.amount, 0);

  if (loading) return <div className="flex justify-center py-20"><div className="loader" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">تراکنش‌ها</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            درآمد کل: <span className="font-semibold text-foreground">{totalPaid.toLocaleString("fa-IR")} تومان</span>
          </p>
        </div>
        <div className="relative">
          <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="input pr-8 text-sm w-48" placeholder="جستجو..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">#</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">کاربر</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">آیتم</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">مبلغ</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">وضعیت</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">تاریخ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center text-muted-foreground py-8">سفارشی یافت نشد</td></tr>
              )}
              {filtered.map(o => (
                <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground">#{o.id}</td>
                  <td className="px-4 py-3">کاربر #{o.userId}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-muted px-2 py-0.5 rounded ml-1">{o.itemType === "course" ? "دوره" : "محصول"}</span>
                    #{o.itemId}
                  </td>
                  <td className="px-4 py-3 font-medium">{o.amount.toLocaleString("fa-IR")} تومان</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      o.status === "paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                    }`}>
                      {o.status === "paid" ? "پرداخت شده" : "در انتظار"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{toPersianDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
