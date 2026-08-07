import { motion } from "framer-motion";
import { Link } from "wouter";
import { Home, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-background text-center"
      dir="rtl"
    >
      <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-6 border border-primary/20">
        <SearchX className="w-12 h-12 text-primary opacity-60" />
      </div>
      <h1 className="text-6xl font-black text-primary mb-3">۴۰۴</h1>
      <h2 className="text-xl font-bold text-foreground mb-2">صفحه پیدا نشد</h2>
      <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mb-8">
        صفحه‌ای که دنبالش می‌گردید وجود ندارد یا منتقل شده است.
      </p>
      <Link href="/">
        <Button className="gap-2 rounded-xl font-bold h-12 px-6">
          <Home className="w-4 h-4" />
          بازگشت به خانه
        </Button>
      </Link>
    </motion.div>
  );
}
