import { staticAssetUrl } from "@/lib/static-assets";
import { useState, useEffect } from "react";
import { CachedImage } from "@/components/ui/cached-image";
import { Trophy, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";

const API = import.meta.env.VITE_API_BASE_URL ?? "";

interface TribeEntry {
  rank: number;
  id: number;
  name: string;
  logo: string | null;
  chiefName: string | null;
  memberCount: number;
  totalPurchase: number;
  score: number;
  members: { name: string; joinedAt: string }[];
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
const font = "'Vazirmatn','Vazirmatn Variable',sans-serif";
function fa(n: number) { return n.toLocaleString("fa-IR"); }

/* ── CSS keyframes ────────────────────────────────────────────────────────── */
const KEYFRAMES = `
@keyframes pDrift1{0%{opacity:0;transform:translate(0,0) scale(1)}12%{opacity:0}35%{opacity:.72}65%{opacity:.45}88%{opacity:0}100%{opacity:0;transform:translate(-12px,-18px) scale(.65)}}
@keyframes pDrift2{0%{opacity:0;transform:translate(0,0)}10%{opacity:0}32%{opacity:.65}68%{opacity:.38}90%{opacity:0}100%{opacity:0;transform:translate(16px,-14px)}}
@keyframes pDrift3{0%{opacity:0;transform:translate(0,0)}15%{opacity:0}40%{opacity:.58}62%{opacity:.42}85%{opacity:0}100%{opacity:0;transform:translate(-8px,16px)}}
@keyframes pDrift4{0%{opacity:0;transform:translate(0,0) scale(1)}18%{opacity:0}45%{opacity:.7}72%{opacity:.4}92%{opacity:0}100%{opacity:0;transform:translate(14px,12px) scale(.7)}}
@keyframes pDrift5{0%{opacity:0;transform:translate(0,0)}8%{opacity:0}30%{opacity:.8}70%{opacity:.35}92%{opacity:0}100%{opacity:0;transform:translate(-14px,8px)}}
@keyframes pDrift6{0%{opacity:0;transform:translate(0,0) scale(.8)}20%{opacity:0}48%{opacity:.6}75%{opacity:.3}95%{opacity:0}100%{opacity:0;transform:translate(10px,-20px) scale(.5)}}
@keyframes pFast1{0%{opacity:0;transform:translate(0,0)}8%{opacity:0}28%{opacity:.85}58%{opacity:.5}88%{opacity:0}100%{opacity:0;transform:translate(-10px,-14px)}}
@keyframes pFast2{0%{opacity:0;transform:translate(0,0) scale(1)}10%{opacity:0}32%{opacity:.78}65%{opacity:.4}90%{opacity:0}100%{opacity:0;transform:translate(12px,10px) scale(.7)}}
@keyframes pFast3{0%{opacity:0;transform:translate(0,0)}6%{opacity:0}25%{opacity:.9}60%{opacity:.35}90%{opacity:0}100%{opacity:0;transform:translate(-8px,12px)}}
@keyframes pDrift7{0%{opacity:0;transform:translate(0,0) scale(.9)}14%{opacity:0}38%{opacity:.68}64%{opacity:.5}86%{opacity:0}100%{opacity:0;transform:translate(18px,-10px) scale(.6)}}
@keyframes pDrift8{0%{opacity:0;transform:translate(0,0)}16%{opacity:0}42%{opacity:.75}70%{opacity:.3}94%{opacity:0}100%{opacity:0;transform:translate(-20px,5px)}}
@keyframes pDrift9{0%{opacity:0;transform:translate(0,0) scale(1)}10%{opacity:0}36%{opacity:.6}72%{opacity:.28}95%{opacity:0}100%{opacity:0;transform:translate(5px,-22px) scale(.55)}}
@keyframes pBurst1{0%{opacity:0;transform:scale(.5)}6%{opacity:.9}30%{opacity:.65}75%{opacity:.15}100%{opacity:0;transform:scale(2)}}
@keyframes pBurst2{0%{opacity:0;transform:scale(.3)}8%{opacity:.8}40%{opacity:.5}85%{opacity:.08}100%{opacity:0;transform:scale(2.5)}}
@keyframes pSlow1{0%{opacity:0;transform:translate(0,0) scale(1)}22%{opacity:0}52%{opacity:.42}82%{opacity:.18}100%{opacity:0;transform:translate(-6px,-8px) scale(.8)}}
@keyframes lineFade{0%,8%,92%,100%{opacity:0}25%,75%{opacity:.55}50%{opacity:.75}}
@keyframes liquidFlow{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}
@keyframes glassShimmer{0%{opacity:0;transform:translateX(-100%)}100%{opacity:.18;transform:translateX(300%)}}
@keyframes cdPulse{0%,100%{box-shadow:0 0 10px rgba(0,210,255,.25),0 0 20px rgba(100,80,255,.12)}50%{box-shadow:0 0 20px rgba(0,210,255,.5),0 0 40px rgba(100,80,255,.28)}}
@keyframes cdFlip{0%{transform:rotateX(0)}50%{transform:rotateX(-90deg)}51%{transform:rotateX(90deg)}100%{transform:rotateX(0)}}
@keyframes confettiA{0%{opacity:1;transform:translate(0,0) rotate(0deg)}100%{opacity:0;transform:translate(var(--cx),var(--cy)) rotate(var(--cr))}}
@keyframes winPop{0%{opacity:0;transform:scale(.6)}60%{opacity:1;transform:scale(1.06)}100%{transform:scale(1)}}
@keyframes winGlow{0%,100%{filter:drop-shadow(0 0 8px rgba(255,210,0,.5))}50%{filter:drop-shadow(0 0 22px rgba(255,210,0,.9))}}
@keyframes radiateRing{0%{transform:scale(.5);opacity:.8}100%{transform:scale(2.2);opacity:0}}
@keyframes histSlideUp{0%{transform:translateY(100%);opacity:0}100%{transform:translateY(0);opacity:1}}
@keyframes spinSlow{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
`;

/* ── Design tokens ─────────────────────────────────────────────────────────── */
const T = {
  bg:     "#050402",
  card:   "linear-gradient(135deg,#0d0b05 0%,#080603 55%,#0e0b04 100%)",
  foil:   "linear-gradient(118deg,#4a2c00 0%,#c08808 12%,#fce060 24%,#fffbe0 35%,#f0c020 46%,#9a6c08 56%,#fde060 68%,#c08808 80%,#4a2c00 100%)",
  gold:   "#c8900a", goldHi:"#fde060", goldTxt:"#f0b820",
  glow1:  "0 0 28px rgba(200,130,0,0.5),0 0 56px rgba(150,90,0,0.22),0 2px 8px rgba(0,0,0,0.8)",
};
const S = {
  card:     "linear-gradient(135deg,#08101a 0%,#050c14 55%,#0a1220 100%)",
  foil:     "linear-gradient(118deg,#1a1e22 0%,#8a9fae 12%,#d4e2ee 24%,#f0f5f8 35%,#c0d0dc 46%,#7090a0 56%,#d0dde8 68%,#9ab0be 80%,#1a1e22 100%)",
  border:   "rgba(140,165,180,0.55)",
  glow:     "0 0 28px rgba(120,160,190,0.45),0 0 56px rgba(80,110,140,0.18),0 2px 8px rgba(0,0,0,0.85)",
  silverHi: "#e8f0f5", silverTxt:"#b8ccd8",
  ambient:  "radial-gradient(ellipse 70% 80% at 50% 40%,rgba(100,140,180,0.08) 0%,transparent 70%)",
};
const B = {
  card:     "linear-gradient(135deg,#140a02 0%,#0c0600 55%,#180d03 100%)",
  foil:     "linear-gradient(118deg,#2a1200 0%,#8b5010 12%,#d4882a 24%,#f0b060 35%,#c07828 46%,#7a4010 56%,#d08030 68%,#9a5818 80%,#2a1200 100%)",
  border:   "rgba(180,110,40,0.5)",
  glow:     "0 0 28px rgba(160,90,20,0.4),0 0 56px rgba(100,55,10,0.16),0 2px 8px rgba(0,0,0,0.85)",
  bronzeHi: "#f0b060", bronzeTxt:"#c07828",
  ambient:  "radial-gradient(ellipse 70% 80% at 50% 40%,rgba(160,90,20,0.07) 0%,transparent 70%)",
};

/* ── Particles ─────────────────────────────────────────────────────────────── */
type Particle = { left:string; top:string; size:number; color:string; anim:string; dur:number; delay:number; shape:"dot"|"line" };

const goldParticles: Particle[] = [
  {left:"6%",top:"12%",size:2.2,color:"rgba(255,230,80,.85)",anim:"pDrift1",dur:11,delay:0,shape:"dot"},
  {left:"18%",top:"72%",size:1.8,color:"rgba(255,255,200,.65)",anim:"pDrift2",dur:13.5,delay:1.2,shape:"dot"},
  {left:"32%",top:"28%",size:2.6,color:"rgba(200,130,0,.75)",anim:"pDrift3",dur:9.5,delay:2.8,shape:"dot"},
  {left:"50%",top:"58%",size:2,color:"rgba(255,240,160,.6)",anim:"pDrift4",dur:12,delay:0.5,shape:"dot"},
  {left:"72%",top:"18%",size:2.4,color:"rgba(255,210,60,.7)",anim:"pDrift5",dur:14,delay:3.5,shape:"dot"},
  {left:"84%",top:"78%",size:1.6,color:"rgba(255,255,220,.55)",anim:"pDrift6",dur:10.5,delay:1.8,shape:"dot"},
  {left:"92%",top:"42%",size:2.2,color:"rgba(200,130,0,.65)",anim:"pDrift1",dur:15,delay:4.2,shape:"dot"},
  {left:"60%",top:"35%",size:3,color:"rgba(255,220,80,.75)",anim:"pDrift3",dur:13,delay:2.2,shape:"dot"},
  {left:"14%",top:"32%",size:6,color:"rgba(200,140,0,.28)",anim:"pDrift5",dur:20,delay:2,shape:"dot"},
  {left:"66%",top:"50%",size:7,color:"rgba(255,220,80,.22)",anim:"pDrift6",dur:22,delay:7,shape:"dot"},
  {left:"25%",top:"22%",size:1.5,color:"rgba(255,245,150,.9)",anim:"pFast1",dur:5,delay:0,shape:"dot"},
  {left:"48%",top:"44%",size:1.8,color:"rgba(255,220,80,.85)",anim:"pFast2",dur:4.5,delay:0.7,shape:"dot"},
  {left:"71%",top:"30%",size:1.4,color:"rgba(255,255,200,.8)",anim:"pFast3",dur:6,delay:1.3,shape:"dot"},
  {left:"15%",top:"68%",size:1.6,color:"rgba(255,230,70,.88)",anim:"pFast1",dur:5.5,delay:2,shape:"dot"},
  {left:"90%",top:"55%",size:2,color:"rgba(255,240,120,.82)",anim:"pFast3",dur:7,delay:1.8,shape:"dot"},
  {left:"54%",top:"20%",size:2,color:"rgba(255,240,100,.9)",anim:"pFast1",dur:7.5,delay:0.5,shape:"dot"},
  {left:"11%",top:"5%",size:1.2,color:"rgba(255,255,255,.9)",anim:"pFast1",dur:4,delay:0.4,shape:"dot"},
  {left:"64%",top:"6%",size:1.1,color:"rgba(255,255,255,.8)",anim:"pFast3",dur:5.3,delay:0.9,shape:"dot"},
  {left:"82%",top:"72%",size:1.2,color:"rgba(255,255,255,.88)",anim:"pFast1",dur:4.6,delay:2.8,shape:"dot"},
  {left:"36%",top:"76%",size:8,color:"rgba(255,255,255,.12)",anim:"pDrift3",dur:24,delay:4,shape:"dot"},
  {left:"70%",top:"25%",size:9,color:"rgba(255,255,255,.1)",anim:"pDrift5",dur:26,delay:9,shape:"dot"},
  {left:"17%",top:"48%",size:2,color:"rgba(255,255,255,.65)",anim:"pFast2",dur:5,delay:2.2,shape:"dot"},
  {left:"83%",top:"38%",size:1.8,color:"rgba(255,255,255,.7)",anim:"pFast3",dur:6.8,delay:0.6,shape:"dot"},
  {left:"20%",top:"3%",size:2.8,color:"rgba(255,215,50,.7)",anim:"pDrift2",dur:13,delay:4.5,shape:"dot"},
  {left:"74%",top:"94%",size:2.4,color:"rgba(255,200,40,.65)",anim:"pDrift4",dur:11,delay:6.2,shape:"dot"},
  {left:"9%",top:"85%",size:2,color:"rgba(255,230,80,.78)",anim:"pDrift2",dur:12,delay:5.1,shape:"dot"},
  {left:"38%",top:"8%",size:1.6,color:"rgba(255,245,150,.8)",anim:"pFast2",dur:4.8,delay:1.6,shape:"dot"},
  {left:"57%",top:"88%",size:2.2,color:"rgba(200,130,0,.7)",anim:"pDrift4",dur:10,delay:3.2,shape:"dot"},
  {left:"78%",top:"62%",size:1.8,color:"rgba(255,220,70,.72)",anim:"pDrift6",dur:14.5,delay:2.6,shape:"dot"},
  {left:"44%",top:"15%",size:1.4,color:"rgba(255,255,200,.85)",anim:"pFast3",dur:5.8,delay:0.3,shape:"dot"},
  {left:"3%",top:"55%",size:2.4,color:"rgba(255,210,60,.65)",anim:"pDrift1",dur:16,delay:7.2,shape:"dot"},
  {left:"88%",top:"20%",size:1.6,color:"rgba(255,240,100,.75)",anim:"pDrift3",dur:11.5,delay:4.8,shape:"dot"},
  {left:"29%",top:"92%",size:2,color:"rgba(200,140,0,.6)",anim:"pDrift5",dur:18,delay:1.4,shape:"dot"},
  {left:"63%",top:"70%",size:1.5,color:"rgba(255,255,220,.7)",anim:"pFast1",dur:6.2,delay:3.1,shape:"dot"},
  {left:"46%",top:"32%",size:1.2,color:"rgba(255,230,80,.9)",anim:"pFast2",dur:3.8,delay:0.2,shape:"dot"},
  {left:"95%",top:"65%",size:1.8,color:"rgba(255,215,50,.68)",anim:"pDrift2",dur:13,delay:5.8,shape:"dot"},
  {left:"22%",top:"40%",size:2.6,color:"rgba(255,220,80,.55)",anim:"pDrift4",dur:21,delay:8.5,shape:"dot"},
  {left:"76%",top:"88%",size:1.4,color:"rgba(255,240,120,.78)",anim:"pFast3",dur:5,delay:2.5,shape:"dot"},
  {left:"52%",top:"5%",size:2,color:"rgba(255,245,150,.82)",anim:"pFast1",dur:4.2,delay:1.1,shape:"dot"},
  {left:"41%",top:"62%",size:1.6,color:"rgba(200,130,0,.5)",anim:"pDrift6",dur:17,delay:6.5,shape:"dot"},
  {left:"8%",top:"38%",size:2.2,color:"rgba(255,230,70,.72)",anim:"pDrift3",dur:12.5,delay:3.8,shape:"dot"},
  {left:"68%",top:"8%",size:1.3,color:"rgba(255,255,200,.88)",anim:"pFast2",dur:4,delay:0.8,shape:"dot"},
  {left:"85%",top:"45%",size:2.8,color:"rgba(255,210,60,.45)",anim:"pDrift1",dur:23,delay:10,shape:"dot"},
  {left:"31%",top:"52%",size:1.5,color:"rgba(255,240,100,.8)",anim:"pFast3",dur:5.5,delay:1.9,shape:"dot"},
  {left:"59%",top:"78%",size:2,color:"rgba(255,220,80,.6)",anim:"pDrift5",dur:15,delay:4,shape:"dot"},
  {left:"13%",top:"18%",size:1.8,color:"rgba(255,245,150,.75)",anim:"pFast1",dur:6.5,delay:2.7,shape:"dot"},
  {left:"96%",top:"32%",size:1.4,color:"rgba(200,140,0,.55)",anim:"pDrift2",dur:12,delay:5.5,shape:"dot"},
  {left:"42%",top:"88%",size:2.4,color:"rgba(255,215,50,.62)",anim:"pDrift4",dur:19,delay:7,shape:"dot"},
  {left:"77%",top:"5%",size:1.6,color:"rgba(255,230,80,.8)",anim:"pFast2",dur:4.5,delay:0.6,shape:"dot"},
  {left:"26%",top:"65%",size:1.2,color:"rgba(255,255,220,.85)",anim:"pFast3",dur:3.5,delay:1.5,shape:"dot"},
  {left:"5%",top:"28%",size:1.8,color:"rgba(255,230,80,.8)",anim:"pDrift7",dur:12,delay:0.3,shape:"dot"},
  {left:"16%",top:"55%",size:2.4,color:"rgba(200,130,0,.6)",anim:"pDrift8",dur:15,delay:2.1,shape:"dot"},
  {left:"28%",top:"10%",size:1.6,color:"rgba(255,245,150,.85)",anim:"pDrift9",dur:9,delay:1.4,shape:"dot"},
  {left:"40%",top:"78%",size:2,color:"rgba(255,215,50,.7)",anim:"pBurst1",dur:7,delay:0.8,shape:"dot"},
  {left:"53%",top:"42%",size:1.4,color:"rgba(255,240,100,.88)",anim:"pBurst2",dur:8,delay:3.5,shape:"dot"},
  {left:"67%",top:"14%",size:2.8,color:"rgba(200,140,0,.5)",anim:"pSlow1",dur:28,delay:5,shape:"dot"},
  {left:"79%",top:"68%",size:1.6,color:"rgba(255,220,80,.72)",anim:"pDrift7",dur:11,delay:4.2,shape:"dot"},
  {left:"91%",top:"30%",size:2.2,color:"rgba(255,255,200,.78)",anim:"pDrift9",dur:13,delay:1.9,shape:"dot"},
  {left:"4%",top:"75%",size:1,color:"rgba(255,245,150,.95)",anim:"pFast1",dur:3.2,delay:0.1,shape:"dot"},
  {left:"13%",top:"8%",size:1.2,color:"rgba(255,230,70,.9)",anim:"pFast2",dur:4.8,delay:2.6,shape:"dot"},
  {left:"24%",top:"48%",size:3.2,color:"rgba(255,220,80,.42)",anim:"pSlow1",dur:32,delay:8,shape:"dot"},
  {left:"35%",top:"90%",size:1.8,color:"rgba(200,130,0,.65)",anim:"pDrift8",dur:10,delay:3.7,shape:"dot"},
  {left:"47%",top:"25%",size:1.4,color:"rgba(255,240,160,.82)",anim:"pFast3",dur:5.2,delay:0.4,shape:"dot"},
  {left:"58%",top:"60%",size:2.6,color:"rgba(255,215,50,.58)",anim:"pDrift7",dur:14,delay:6,shape:"dot"},
  {left:"69%",top:"38%",size:1,color:"rgba(255,255,220,.92)",anim:"pFast1",dur:3.8,delay:1.1,shape:"dot"},
  {left:"81%",top:"82%",size:2,color:"rgba(200,140,0,.55)",anim:"pDrift9",dur:16,delay:4.8,shape:"dot"},
  {left:"93%",top:"12%",size:1.6,color:"rgba(255,230,80,.75)",anim:"pBurst1",dur:6.5,delay:2.3,shape:"dot"},
  {left:"2%",top:"42%",size:4,color:"rgba(255,210,60,.18)",anim:"pSlow1",dur:35,delay:12,shape:"dot"},
  {left:"12%",top:"88%",size:1.2,color:"rgba(255,245,150,.88)",anim:"pFast2",dur:4.2,delay:1.7,shape:"dot"},
  {left:"23%",top:"18%",size:2.2,color:"rgba(200,130,0,.72)",anim:"pDrift7",dur:11.5,delay:3.1,shape:"dot"},
  {left:"34%",top:"58%",size:1.8,color:"rgba(255,220,80,.68)",anim:"pDrift8",dur:13,delay:5.4,shape:"dot"},
  {left:"45%",top:"36%",size:1.2,color:"rgba(255,255,200,.9)",anim:"pFast3",dur:3.6,delay:0.6,shape:"dot"},
  {left:"56%",top:"82%",size:2.4,color:"rgba(255,215,50,.62)",anim:"pDrift9",dur:17,delay:7.2,shape:"dot"},
  {left:"67%",top:"52%",size:1.6,color:"rgba(255,240,100,.78)",anim:"pFast1",dur:6,delay:2.8,shape:"dot"},
  {left:"78%",top:"22%",size:2,color:"rgba(200,140,0,.58)",anim:"pBurst2",dur:9,delay:4.1,shape:"dot"},
  {left:"89%",top:"76%",size:1.4,color:"rgba(255,230,80,.82)",anim:"pDrift7",dur:12.5,delay:1.6,shape:"dot"},
  {left:"97%",top:"48%",size:1.8,color:"rgba(255,245,150,.72)",anim:"pSlow1",dur:25,delay:9.5,shape:"dot"},
  {left:"7%",top:"62%",size:1,color:"rgba(255,255,220,.95)",anim:"pFast2",dur:3.4,delay:0.2,shape:"dot"},
  {left:"19%",top:"30%",size:5,color:"rgba(255,210,60,.15)",anim:"pSlow1",dur:38,delay:15,shape:"dot"},
  {left:"30%",top:"72%",size:1.6,color:"rgba(200,130,0,.68)",anim:"pDrift8",dur:10.5,delay:3.9,shape:"dot"},
  {left:"43%",top:"6%",size:1.2,color:"rgba(255,240,100,.92)",anim:"pFast3",dur:4,delay:0.9,shape:"dot"},
  {left:"54%",top:"48%",size:2.8,color:"rgba(255,220,80,.48)",anim:"pDrift9",dur:20,delay:8.8,shape:"dot"},
  {left:"65%",top:"86%",size:1.8,color:"rgba(255,215,50,.7)",anim:"pDrift7",dur:13.5,delay:5.7,shape:"dot"},
  {left:"76%",top:"36%",size:1.4,color:"rgba(255,255,200,.85)",anim:"pFast1",dur:5.5,delay:2,shape:"dot"},
  {left:"87%",top:"62%",size:2.2,color:"rgba(200,140,0,.62)",anim:"pBurst1",dur:8,delay:3.3,shape:"dot"},
  {left:"98%",top:"18%",size:1,color:"rgba(255,230,80,.9)",anim:"pFast2",dur:3.8,delay:1.3,shape:"dot"},
  {left:"10%",top:"45%",size:6,color:"rgba(255,200,40,.12)",anim:"pSlow1",dur:40,delay:18,shape:"dot"},
  {left:"21%",top:"82%",size:1.6,color:"rgba(255,245,150,.78)",anim:"pDrift8",dur:11,delay:4.6,shape:"dot"},
  {left:"33%",top:"22%",size:2,color:"rgba(200,130,0,.65)",anim:"pDrift9",dur:14,delay:6.5,shape:"dot"},
  {left:"44%",top:"68%",size:1.2,color:"rgba(255,240,160,.88)",anim:"pFast3",dur:4.5,delay:1,shape:"dot"},
  {left:"55%",top:"14%",size:2.6,color:"rgba(255,215,50,.55)",anim:"pDrift7",dur:16,delay:7.8,shape:"dot"},
  {left:"66%",top:"58%",size:1.8,color:"rgba(255,220,80,.72)",anim:"pFast1",dur:6.2,delay:2.4,shape:"dot"},
  {left:"77%",top:"8%",size:1.4,color:"rgba(255,255,220,.88)",anim:"pBurst2",dur:7.5,delay:3.8,shape:"dot"},
  {left:"88%",top:"44%",size:2.4,color:"rgba(200,140,0,.5)",anim:"pSlow1",dur:30,delay:11,shape:"dot"},
  {left:"99%",top:"78%",size:1,color:"rgba(255,230,80,.9)",anim:"pFast2",dur:3.2,delay:0.5,shape:"dot"},
  {left:"6%",top:"20%",size:3.6,color:"rgba(255,215,50,.22)",anim:"pDrift8",dur:22,delay:9,shape:"dot"},
  {left:"17%",top:"60%",size:1.8,color:"rgba(255,245,150,.75)",anim:"pDrift9",dur:12,delay:4,shape:"dot"},
  {left:"28%",top:"36%",size:1.2,color:"rgba(200,130,0,.7)",anim:"pFast3",dur:5,delay:1.5,shape:"dot"},
  {left:"39%",top:"50%",size:2.2,color:"rgba(255,240,100,.65)",anim:"pDrift7",dur:13,delay:6.2,shape:"dot"},
  {left:"50%",top:"28%",size:1.6,color:"rgba(255,220,80,.8)",anim:"pFast1",dur:4.5,delay:1.8,shape:"dot"},
  {left:"61%",top:"72%",size:2,color:"rgba(255,255,200,.62)",anim:"pBurst1",dur:8.5,delay:3.5,shape:"dot"},
  {left:"72%",top:"16%",size:1.4,color:"rgba(200,140,0,.68)",anim:"pDrift9",dur:15,delay:7,shape:"dot"},
  {left:"83%",top:"56%",size:2.8,color:"rgba(255,230,80,.45)",anim:"pSlow1",dur:28,delay:10,shape:"dot"},
  {left:"94%",top:"90%",size:1.2,color:"rgba(255,245,150,.85)",anim:"pFast2",dur:4,delay:2.2,shape:"dot"},
  {left:"3%",top:"32%",size:1.8,color:"rgba(255,215,50,.72)",anim:"pDrift8",dur:11,delay:5.2,shape:"dot"},
  {left:"14%",top:"76%",size:2.4,color:"rgba(200,130,0,.55)",anim:"pDrift7",dur:14.5,delay:6.8,shape:"dot"},
  {left:"25%",top:"44%",size:1,color:"rgba(255,255,220,.95)",anim:"pFast3",dur:3.5,delay:0.7,shape:"dot"},
  {left:"36%",top:"16%",size:2,color:"rgba(255,240,160,.7)",anim:"pBurst2",dur:9.5,delay:4.5,shape:"dot"},
  {left:"47%",top:"60%",size:1.6,color:"rgba(255,215,50,.68)",anim:"pDrift9",dur:12,delay:5.8,shape:"dot"},
  {left:"58%",top:"30%",size:3,color:"rgba(200,140,0,.28)",anim:"pSlow1",dur:35,delay:14,shape:"dot"},
  {left:"69%",top:"80%",size:1.4,color:"rgba(255,230,80,.78)",anim:"pFast1",dur:5.8,delay:2.7,shape:"dot"},
  {left:"80%",top:"46%",size:2.2,color:"rgba(255,245,150,.65)",anim:"pDrift8",dur:10,delay:4.3,shape:"dot"},
  {left:"91%",top:"10%",size:1.8,color:"rgba(255,220,80,.8)",anim:"pDrift7",dur:13,delay:6,shape:"dot"},
  {left:"1%",top:"58%",size:1.2,color:"rgba(255,255,200,.88)",anim:"pFast2",dur:4.2,delay:1,shape:"dot"},
  {left:"12%",top:"24%",size:4.5,color:"rgba(255,210,60,.18)",anim:"pSlow1",dur:42,delay:20,shape:"dot"},
  {left:"23%",top:"84%",size:1.6,color:"rgba(200,130,0,.62)",anim:"pDrift9",dur:11.5,delay:5,shape:"dot"},
  {left:"34%",top:"42%",size:1,color:"rgba(255,240,100,.92)",anim:"pFast3",dur:3.8,delay:0.3,shape:"dot"},
  {left:"45%",top:"18%",size:2.4,color:"rgba(255,215,50,.58)",anim:"pDrift7",dur:15,delay:7.5,shape:"dot"},
  {left:"56%",top:"68%",size:1.8,color:"rgba(255,220,80,.7)",anim:"pBurst1",dur:7,delay:3.2,shape:"dot"},
  {left:"67%",top:"34%",size:1.4,color:"rgba(200,140,0,.65)",anim:"pDrift8",dur:12,delay:5.5,shape:"dot"},
  {left:"78%",top:"54%",size:2,color:"rgba(255,255,220,.72)",anim:"pFast1",dur:6.5,delay:2.5,shape:"dot"},
  {left:"89%",top:"24%",size:1.6,color:"rgba(255,230,80,.8)",anim:"pSlow1",dur:26,delay:11.5,shape:"dot"},
  {left:"97%",top:"70%",size:1.2,color:"rgba(255,245,150,.88)",anim:"pFast2",dur:4.5,delay:1.4,shape:"dot"},
  {left:"8%",top:"50%",size:2.6,color:"rgba(200,130,0,.48)",anim:"pDrift9",dur:18,delay:8.2,shape:"dot"},
  {left:"19%",top:"14%",size:1.8,color:"rgba(255,240,100,.76)",anim:"pDrift7",dur:11,delay:4.7,shape:"dot"},
  {left:"30%",top:"66%",size:1.2,color:"rgba(255,215,50,.85)",anim:"pFast3",dur:4,delay:0.8,shape:"dot"},
  {left:"41%",top:"38%",size:2.2,color:"rgba(255,220,80,.62)",anim:"pBurst2",dur:9,delay:4,shape:"dot"},
  {left:"52%",top:"90%",size:1.6,color:"rgba(200,140,0,.55)",anim:"pDrift8",dur:13.5,delay:6.3,shape:"dot"},
  {left:"63%",top:"26%",size:1,color:"rgba(255,255,200,.94)",anim:"pFast1",dur:3.5,delay:0.9,shape:"dot"},
  {left:"74%",top:"74%",size:2.8,color:"rgba(255,215,50,.4)",anim:"pSlow1",dur:32,delay:13,shape:"dot"},
  {left:"85%",top:"14%",size:1.8,color:"rgba(255,230,80,.75)",anim:"pDrift9",dur:12,delay:5.1,shape:"dot"},
  {left:"96%",top:"56%",size:1.4,color:"rgba(255,245,150,.82)",anim:"pFast2",dur:5.5,delay:2.1,shape:"dot"},
  {left:"15%",top:"94%",size:2,color:"rgba(200,130,0,.6)",anim:"pDrift7",dur:14,delay:6.7,shape:"dot"},
  {left:"27%",top:"4%",size:1.6,color:"rgba(255,240,160,.8)",anim:"pBurst1",dur:7.5,delay:3.6,shape:"dot"},
  {left:"38%",top:"54%",size:1.2,color:"rgba(255,220,80,.88)",anim:"pFast3",dur:3.6,delay:0.4,shape:"dot"},
  {left:"49%",top:"32%",size:2.6,color:"rgba(200,140,0,.52)",anim:"pDrift8",dur:16,delay:7.4,shape:"dot"},
  {left:"60%",top:"80%",size:1.8,color:"rgba(255,215,50,.66)",anim:"pDrift9",dur:11,delay:4.9,shape:"dot"},
  {left:"71%",top:"46%",size:1.4,color:"rgba(255,255,220,.88)",anim:"pFast1",dur:6,delay:2.3,shape:"dot"},
  {left:"82%",top:"28%",size:2.2,color:"rgba(255,230,80,.7)",anim:"pSlow1",dur:27,delay:10.5,shape:"dot"},
  {left:"93%",top:"84%",size:1,color:"rgba(255,245,150,.9)",anim:"pFast2",dur:4.8,delay:1.6,shape:"dot"},
  {left:"4%",top:"16%",size:7,color:"rgba(255,200,40,.1)",anim:"pSlow1",dur:45,delay:22,shape:"dot"},
  {left:"48%",top:"96%",size:1.4,color:"rgba(255,215,50,.78)",anim:"pDrift7",dur:10.5,delay:5.3,shape:"dot"},
  {left:"75%",top:"96%",size:1.8,color:"rgba(200,130,0,.58)",anim:"pBurst2",dur:8,delay:3,shape:"dot"},
  {left:"22%",top:"96%",size:1.2,color:"rgba(255,240,100,.85)",anim:"pFast3",dur:4.2,delay:1.2,shape:"dot"},
];

const silverParticles: Particle[] = [
  {left:"6%",top:"12%",size:2.2,color:"rgba(200,220,235,.8)",anim:"pDrift1",dur:11,delay:0,shape:"dot"},
  {left:"18%",top:"72%",size:1.8,color:"rgba(240,248,255,.6)",anim:"pDrift2",dur:13.5,delay:1.2,shape:"dot"},
  {left:"32%",top:"28%",size:2.6,color:"rgba(160,195,215,.7)",anim:"pDrift3",dur:9.5,delay:2.8,shape:"dot"},
  {left:"50%",top:"58%",size:2,color:"rgba(210,230,245,.55)",anim:"pDrift4",dur:12,delay:0.5,shape:"dot"},
  {left:"72%",top:"18%",size:2.4,color:"rgba(185,210,230,.65)",anim:"pDrift5",dur:14,delay:3.5,shape:"dot"},
  {left:"14%",top:"32%",size:6.5,color:"rgba(120,165,200,.2)",anim:"pDrift5",dur:20,delay:2,shape:"dot"},
  {left:"66%",top:"50%",size:7,color:"rgba(160,200,225,.18)",anim:"pDrift6",dur:22,delay:7,shape:"dot"},
  {left:"25%",top:"22%",size:1.5,color:"rgba(220,235,250,.9)",anim:"pFast1",dur:5,delay:0,shape:"dot"},
  {left:"48%",top:"44%",size:1.8,color:"rgba(190,215,235,.85)",anim:"pFast2",dur:4.5,delay:0.7,shape:"dot"},
  {left:"71%",top:"30%",size:1.4,color:"rgba(240,248,255,.8)",anim:"pFast3",dur:6,delay:1.3,shape:"dot"},
  {left:"11%",top:"5%",size:1.2,color:"rgba(255,255,255,.9)",anim:"pFast1",dur:4,delay:0.4,shape:"dot"},
  {left:"64%",top:"6%",size:1.1,color:"rgba(255,255,255,.8)",anim:"pFast3",dur:5.3,delay:0.9,shape:"dot"},
  {left:"36%",top:"76%",size:8,color:"rgba(255,255,255,.1)",anim:"pDrift3",dur:24,delay:4,shape:"dot"},
  {left:"70%",top:"25%",size:9,color:"rgba(255,255,255,.08)",anim:"pDrift5",dur:26,delay:9,shape:"dot"},
  {left:"17%",top:"48%",size:2,color:"rgba(255,255,255,.65)",anim:"pFast2",dur:5,delay:2.2,shape:"dot"},
  {left:"83%",top:"38%",size:1.8,color:"rgba(255,255,255,.7)",anim:"pFast3",dur:6.8,delay:0.6,shape:"dot"},
  {left:"9%",top:"85%",size:2,color:"rgba(200,220,235,.72)",anim:"pDrift2",dur:12,delay:5.1,shape:"dot"},
  {left:"38%",top:"8%",size:1.6,color:"rgba(220,235,250,.82)",anim:"pFast2",dur:4.8,delay:1.6,shape:"dot"},
  {left:"57%",top:"88%",size:2.2,color:"rgba(160,195,215,.65)",anim:"pDrift4",dur:10,delay:3.2,shape:"dot"},
  {left:"78%",top:"62%",size:1.8,color:"rgba(185,210,230,.68)",anim:"pDrift6",dur:14.5,delay:2.6,shape:"dot"},
  {left:"44%",top:"15%",size:1.4,color:"rgba(240,248,255,.88)",anim:"pFast3",dur:5.8,delay:0.3,shape:"dot"},
  {left:"3%",top:"55%",size:2.4,color:"rgba(200,220,235,.6)",anim:"pDrift1",dur:16,delay:7.2,shape:"dot"},
  {left:"88%",top:"20%",size:1.6,color:"rgba(220,235,250,.72)",anim:"pDrift3",dur:11.5,delay:4.8,shape:"dot"},
  {left:"29%",top:"92%",size:2,color:"rgba(160,195,215,.55)",anim:"pDrift5",dur:18,delay:1.4,shape:"dot"},
  {left:"63%",top:"70%",size:1.5,color:"rgba(240,248,255,.7)",anim:"pFast1",dur:6.2,delay:3.1,shape:"dot"},
  {left:"46%",top:"32%",size:1.2,color:"rgba(200,220,235,.88)",anim:"pFast2",dur:3.8,delay:0.2,shape:"dot"},
  {left:"95%",top:"65%",size:1.8,color:"rgba(185,210,230,.62)",anim:"pDrift2",dur:13,delay:5.8,shape:"dot"},
  {left:"22%",top:"40%",size:2.6,color:"rgba(160,200,225,.45)",anim:"pDrift4",dur:21,delay:8.5,shape:"dot"},
  {left:"76%",top:"88%",size:1.4,color:"rgba(220,235,250,.75)",anim:"pFast3",dur:5,delay:2.5,shape:"dot"},
  {left:"52%",top:"5%",size:2,color:"rgba(240,248,255,.82)",anim:"pFast1",dur:4.2,delay:1.1,shape:"dot"},
  {left:"41%",top:"62%",size:1.6,color:"rgba(160,195,215,.5)",anim:"pDrift6",dur:17,delay:6.5,shape:"dot"},
  {left:"8%",top:"38%",size:2.2,color:"rgba(200,220,235,.68)",anim:"pDrift3",dur:12.5,delay:3.8,shape:"dot"},
  {left:"5%",top:"28%",size:1.8,color:"rgba(200,220,235,.75)",anim:"pDrift7",dur:12,delay:0.3,shape:"dot"},
  {left:"16%",top:"55%",size:2.4,color:"rgba(160,195,215,.58)",anim:"pDrift8",dur:15,delay:2.1,shape:"dot"},
  {left:"28%",top:"10%",size:1.6,color:"rgba(220,235,250,.82)",anim:"pDrift9",dur:9,delay:1.4,shape:"dot"},
  {left:"40%",top:"78%",size:2,color:"rgba(185,210,230,.68)",anim:"pBurst1",dur:7,delay:0.8,shape:"dot"},
  {left:"53%",top:"42%",size:1.4,color:"rgba(240,248,255,.88)",anim:"pBurst2",dur:8,delay:3.5,shape:"dot"},
  {left:"67%",top:"14%",size:2.8,color:"rgba(120,165,200,.48)",anim:"pSlow1",dur:28,delay:5,shape:"dot"},
  {left:"79%",top:"68%",size:1.6,color:"rgba(200,220,235,.7)",anim:"pDrift7",dur:11,delay:4.2,shape:"dot"},
  {left:"91%",top:"30%",size:2.2,color:"rgba(240,248,255,.76)",anim:"pDrift9",dur:13,delay:1.9,shape:"dot"},
  {left:"4%",top:"75%",size:1,color:"rgba(220,235,250,.95)",anim:"pFast1",dur:3.2,delay:0.1,shape:"dot"},
  {left:"13%",top:"8%",size:1.2,color:"rgba(190,215,235,.9)",anim:"pFast2",dur:4.8,delay:2.6,shape:"dot"},
  {left:"24%",top:"48%",size:3.2,color:"rgba(160,200,225,.32)",anim:"pSlow1",dur:32,delay:8,shape:"dot"},
  {left:"35%",top:"90%",size:1.8,color:"rgba(160,195,215,.62)",anim:"pDrift8",dur:10,delay:3.7,shape:"dot"},
  {left:"47%",top:"25%",size:1.4,color:"rgba(210,230,245,.82)",anim:"pFast3",dur:5.2,delay:0.4,shape:"dot"},
  {left:"58%",top:"60%",size:2.6,color:"rgba(185,210,230,.55)",anim:"pDrift7",dur:14,delay:6,shape:"dot"},
  {left:"69%",top:"38%",size:1,color:"rgba(240,248,255,.92)",anim:"pFast1",dur:3.8,delay:1.1,shape:"dot"},
  {left:"81%",top:"82%",size:2,color:"rgba(120,165,200,.52)",anim:"pDrift9",dur:16,delay:4.8,shape:"dot"},
  {left:"93%",top:"12%",size:1.6,color:"rgba(200,220,235,.72)",anim:"pBurst1",dur:6.5,delay:2.3,shape:"dot"},
  {left:"2%",top:"42%",size:4,color:"rgba(160,200,225,.15)",anim:"pSlow1",dur:35,delay:12,shape:"dot"},
  {left:"12%",top:"88%",size:1.2,color:"rgba(220,235,250,.88)",anim:"pFast2",dur:4.2,delay:1.7,shape:"dot"},
  {left:"23%",top:"18%",size:2.2,color:"rgba(160,195,215,.7)",anim:"pDrift7",dur:11.5,delay:3.1,shape:"dot"},
  {left:"34%",top:"58%",size:1.8,color:"rgba(200,220,235,.65)",anim:"pDrift8",dur:13,delay:5.4,shape:"dot"},
  {left:"45%",top:"36%",size:1.2,color:"rgba(240,248,255,.9)",anim:"pFast3",dur:3.6,delay:0.6,shape:"dot"},
  {left:"56%",top:"82%",size:2.4,color:"rgba(185,210,230,.6)",anim:"pDrift9",dur:17,delay:7.2,shape:"dot"},
  {left:"67%",top:"52%",size:1.6,color:"rgba(210,230,245,.76)",anim:"pFast1",dur:6,delay:2.8,shape:"dot"},
  {left:"78%",top:"22%",size:2,color:"rgba(120,165,200,.55)",anim:"pBurst2",dur:9,delay:4.1,shape:"dot"},
  {left:"89%",top:"76%",size:1.4,color:"rgba(200,220,235,.8)",anim:"pDrift7",dur:12.5,delay:1.6,shape:"dot"},
  {left:"97%",top:"48%",size:1.8,color:"rgba(220,235,250,.7)",anim:"pSlow1",dur:25,delay:9.5,shape:"dot"},
  {left:"7%",top:"62%",size:1,color:"rgba(240,248,255,.95)",anim:"pFast2",dur:3.4,delay:0.2,shape:"dot"},
  {left:"19%",top:"30%",size:5,color:"rgba(160,200,225,.12)",anim:"pSlow1",dur:38,delay:15,shape:"dot"},
  {left:"30%",top:"72%",size:1.6,color:"rgba(160,195,215,.65)",anim:"pDrift8",dur:10.5,delay:3.9,shape:"dot"},
  {left:"43%",top:"6%",size:1.2,color:"rgba(210,230,245,.92)",anim:"pFast3",dur:4,delay:0.9,shape:"dot"},
  {left:"54%",top:"48%",size:2.8,color:"rgba(185,210,230,.45)",anim:"pDrift9",dur:20,delay:8.8,shape:"dot"},
  {left:"65%",top:"86%",size:1.8,color:"rgba(200,220,235,.68)",anim:"pDrift7",dur:13.5,delay:5.7,shape:"dot"},
  {left:"76%",top:"36%",size:1.4,color:"rgba(240,248,255,.85)",anim:"pFast1",dur:5.5,delay:2,shape:"dot"},
  {left:"87%",top:"62%",size:2.2,color:"rgba(120,165,200,.6)",anim:"pBurst1",dur:8,delay:3.3,shape:"dot"},
  {left:"98%",top:"18%",size:1,color:"rgba(220,235,250,.9)",anim:"pFast2",dur:3.8,delay:1.3,shape:"dot"},
  {left:"10%",top:"45%",size:6,color:"rgba(160,200,225,.1)",anim:"pSlow1",dur:40,delay:18,shape:"dot"},
  {left:"21%",top:"82%",size:1.6,color:"rgba(220,235,250,.76)",anim:"pDrift8",dur:11,delay:4.6,shape:"dot"},
  {left:"33%",top:"22%",size:2,color:"rgba(160,195,215,.62)",anim:"pDrift9",dur:14,delay:6.5,shape:"dot"},
  {left:"44%",top:"68%",size:1.2,color:"rgba(240,248,255,.88)",anim:"pFast3",dur:4.5,delay:1,shape:"dot"},
  {left:"55%",top:"14%",size:2.6,color:"rgba(185,210,230,.52)",anim:"pDrift7",dur:16,delay:7.8,shape:"dot"},
  {left:"66%",top:"58%",size:1.8,color:"rgba(200,220,235,.7)",anim:"pFast1",dur:6.2,delay:2.4,shape:"dot"},
  {left:"77%",top:"8%",size:1.4,color:"rgba(210,230,245,.85)",anim:"pBurst2",dur:7.5,delay:3.8,shape:"dot"},
  {left:"88%",top:"44%",size:2.4,color:"rgba(120,165,200,.48)",anim:"pSlow1",dur:30,delay:11,shape:"dot"},
  {left:"99%",top:"78%",size:1,color:"rgba(220,235,250,.9)",anim:"pFast2",dur:3.2,delay:0.5,shape:"dot"},
  {left:"6%",top:"20%",size:3.6,color:"rgba(160,200,225,.2)",anim:"pDrift8",dur:22,delay:9,shape:"dot"},
  {left:"17%",top:"60%",size:1.8,color:"rgba(220,235,250,.72)",anim:"pDrift9",dur:12,delay:4,shape:"dot"},
  {left:"28%",top:"36%",size:1.2,color:"rgba(160,195,215,.68)",anim:"pFast3",dur:5,delay:1.5,shape:"dot"},
  {left:"39%",top:"50%",size:2.2,color:"rgba(200,220,235,.62)",anim:"pDrift7",dur:13,delay:6.2,shape:"dot"},
  {left:"50%",top:"28%",size:1.6,color:"rgba(240,248,255,.78)",anim:"pFast1",dur:4.5,delay:1.8,shape:"dot"},
  {left:"61%",top:"72%",size:2,color:"rgba(185,210,230,.6)",anim:"pBurst1",dur:8.5,delay:3.5,shape:"dot"},
  {left:"72%",top:"16%",size:1.4,color:"rgba(120,165,200,.65)",anim:"pDrift9",dur:15,delay:7,shape:"dot"},
  {left:"83%",top:"56%",size:2.8,color:"rgba(200,220,235,.42)",anim:"pSlow1",dur:28,delay:10,shape:"dot"},
  {left:"94%",top:"90%",size:1.2,color:"rgba(220,235,250,.82)",anim:"pFast2",dur:4,delay:2.2,shape:"dot"},
  {left:"3%",top:"32%",size:1.8,color:"rgba(160,195,215,.7)",anim:"pDrift8",dur:11,delay:5.2,shape:"dot"},
  {left:"14%",top:"76%",size:2.4,color:"rgba(160,200,225,.52)",anim:"pDrift7",dur:14.5,delay:6.8,shape:"dot"},
  {left:"25%",top:"44%",size:1,color:"rgba(240,248,255,.95)",anim:"pFast3",dur:3.5,delay:0.7,shape:"dot"},
  {left:"36%",top:"16%",size:2,color:"rgba(210,230,245,.68)",anim:"pBurst2",dur:9.5,delay:4.5,shape:"dot"},
  {left:"47%",top:"60%",size:1.6,color:"rgba(185,210,230,.65)",anim:"pDrift9",dur:12,delay:5.8,shape:"dot"},
  {left:"58%",top:"30%",size:3,color:"rgba(120,165,200,.25)",anim:"pSlow1",dur:35,delay:14,shape:"dot"},
  {left:"69%",top:"80%",size:1.4,color:"rgba(200,220,235,.76)",anim:"pFast1",dur:5.8,delay:2.7,shape:"dot"},
  {left:"80%",top:"46%",size:2.2,color:"rgba(220,235,250,.62)",anim:"pDrift8",dur:10,delay:4.3,shape:"dot"},
  {left:"91%",top:"10%",size:1.8,color:"rgba(160,195,215,.78)",anim:"pDrift7",dur:13,delay:6,shape:"dot"},
];

const bronzeParticles: Particle[] = [
  {left:"6%",top:"12%",size:2.2,color:"rgba(220,140,40,.8)",anim:"pDrift1",dur:11,delay:0,shape:"dot"},
  {left:"18%",top:"72%",size:1.8,color:"rgba(240,190,80,.6)",anim:"pDrift2",dur:13.5,delay:1.2,shape:"dot"},
  {left:"32%",top:"28%",size:2.6,color:"rgba(160,80,20,.7)",anim:"pDrift3",dur:9.5,delay:2.8,shape:"dot"},
  {left:"50%",top:"58%",size:2,color:"rgba(210,150,50,.55)",anim:"pDrift4",dur:12,delay:0.5,shape:"dot"},
  {left:"72%",top:"18%",size:2.4,color:"rgba(185,110,30,.65)",anim:"pDrift5",dur:14,delay:3.5,shape:"dot"},
  {left:"14%",top:"32%",size:6.5,color:"rgba(160,85,20,.2)",anim:"pDrift5",dur:20,delay:2,shape:"dot"},
  {left:"66%",top:"50%",size:7,color:"rgba(200,130,40,.18)",anim:"pDrift6",dur:22,delay:7,shape:"dot"},
  {left:"25%",top:"22%",size:1.5,color:"rgba(240,185,70,.9)",anim:"pFast1",dur:5,delay:0,shape:"dot"},
  {left:"48%",top:"44%",size:1.8,color:"rgba(210,140,45,.85)",anim:"pFast2",dur:4.5,delay:0.7,shape:"dot"},
  {left:"71%",top:"30%",size:1.4,color:"rgba(245,200,90,.8)",anim:"pFast3",dur:6,delay:1.3,shape:"dot"},
  {left:"11%",top:"5%",size:1.2,color:"rgba(255,255,255,.85)",anim:"pFast1",dur:4,delay:0.4,shape:"dot"},
  {left:"64%",top:"6%",size:1.1,color:"rgba(255,255,255,.75)",anim:"pFast3",dur:5.3,delay:0.9,shape:"dot"},
  {left:"36%",top:"76%",size:8,color:"rgba(255,255,255,.08)",anim:"pDrift3",dur:24,delay:4,shape:"dot"},
  {left:"70%",top:"25%",size:9,color:"rgba(180,100,25,.12)",anim:"pDrift5",dur:26,delay:9,shape:"dot"},
  {left:"17%",top:"48%",size:2,color:"rgba(240,185,70,.65)",anim:"pFast2",dur:5,delay:2.2,shape:"dot"},
  {left:"83%",top:"38%",size:1.8,color:"rgba(245,200,85,.7)",anim:"pFast3",dur:6.8,delay:0.6,shape:"dot"},
  {left:"9%",top:"85%",size:2,color:"rgba(220,140,40,.72)",anim:"pDrift2",dur:12,delay:5.1,shape:"dot"},
  {left:"38%",top:"8%",size:1.6,color:"rgba(240,185,70,.8)",anim:"pFast2",dur:4.8,delay:1.6,shape:"dot"},
  {left:"57%",top:"88%",size:2.2,color:"rgba(160,80,20,.65)",anim:"pDrift4",dur:10,delay:3.2,shape:"dot"},
  {left:"78%",top:"62%",size:1.8,color:"rgba(210,140,45,.68)",anim:"pDrift6",dur:14.5,delay:2.6,shape:"dot"},
  {left:"44%",top:"15%",size:1.4,color:"rgba(245,200,90,.85)",anim:"pFast3",dur:5.8,delay:0.3,shape:"dot"},
  {left:"3%",top:"55%",size:2.4,color:"rgba(185,110,30,.6)",anim:"pDrift1",dur:16,delay:7.2,shape:"dot"},
  {left:"88%",top:"20%",size:1.6,color:"rgba(240,185,70,.7)",anim:"pDrift3",dur:11.5,delay:4.8,shape:"dot"},
  {left:"29%",top:"92%",size:2,color:"rgba(200,130,40,.55)",anim:"pDrift5",dur:18,delay:1.4,shape:"dot"},
  {left:"63%",top:"70%",size:1.5,color:"rgba(245,200,90,.7)",anim:"pFast1",dur:6.2,delay:3.1,shape:"dot"},
  {left:"46%",top:"32%",size:1.2,color:"rgba(220,140,40,.88)",anim:"pFast2",dur:3.8,delay:0.2,shape:"dot"},
  {left:"95%",top:"65%",size:1.8,color:"rgba(185,110,30,.62)",anim:"pDrift2",dur:13,delay:5.8,shape:"dot"},
  {left:"22%",top:"40%",size:2.6,color:"rgba(200,130,40,.45)",anim:"pDrift4",dur:21,delay:8.5,shape:"dot"},
  {left:"76%",top:"88%",size:1.4,color:"rgba(240,185,70,.75)",anim:"pFast3",dur:5,delay:2.5,shape:"dot"},
  {left:"52%",top:"5%",size:2,color:"rgba(245,200,90,.82)",anim:"pFast1",dur:4.2,delay:1.1,shape:"dot"},
  {left:"41%",top:"62%",size:1.6,color:"rgba(160,80,20,.5)",anim:"pDrift6",dur:17,delay:6.5,shape:"dot"},
  {left:"8%",top:"38%",size:2.2,color:"rgba(220,140,40,.68)",anim:"pDrift3",dur:12.5,delay:3.8,shape:"dot"},
  {left:"5%",top:"28%",size:1.8,color:"rgba(220,140,40,.75)",anim:"pDrift7",dur:12,delay:0.3,shape:"dot"},
  {left:"16%",top:"55%",size:2.4,color:"rgba(160,80,20,.58)",anim:"pDrift8",dur:15,delay:2.1,shape:"dot"},
  {left:"28%",top:"10%",size:1.6,color:"rgba(240,185,70,.82)",anim:"pDrift9",dur:9,delay:1.4,shape:"dot"},
  {left:"40%",top:"78%",size:2,color:"rgba(185,110,30,.68)",anim:"pBurst1",dur:7,delay:0.8,shape:"dot"},
  {left:"53%",top:"42%",size:1.4,color:"rgba(245,200,90,.88)",anim:"pBurst2",dur:8,delay:3.5,shape:"dot"},
  {left:"67%",top:"14%",size:2.8,color:"rgba(160,85,20,.48)",anim:"pSlow1",dur:28,delay:5,shape:"dot"},
  {left:"79%",top:"68%",size:1.6,color:"rgba(220,140,40,.7)",anim:"pDrift7",dur:11,delay:4.2,shape:"dot"},
  {left:"91%",top:"30%",size:2.2,color:"rgba(240,190,80,.76)",anim:"pDrift9",dur:13,delay:1.9,shape:"dot"},
  {left:"4%",top:"75%",size:1,color:"rgba(240,185,70,.95)",anim:"pFast1",dur:3.2,delay:0.1,shape:"dot"},
  {left:"13%",top:"8%",size:1.2,color:"rgba(210,140,45,.9)",anim:"pFast2",dur:4.8,delay:2.6,shape:"dot"},
  {left:"24%",top:"48%",size:3.2,color:"rgba(200,130,40,.32)",anim:"pSlow1",dur:32,delay:8,shape:"dot"},
  {left:"35%",top:"90%",size:1.8,color:"rgba(160,80,20,.62)",anim:"pDrift8",dur:10,delay:3.7,shape:"dot"},
  {left:"47%",top:"25%",size:1.4,color:"rgba(245,200,90,.82)",anim:"pFast3",dur:5.2,delay:0.4,shape:"dot"},
  {left:"58%",top:"60%",size:2.6,color:"rgba(185,110,30,.55)",anim:"pDrift7",dur:14,delay:6,shape:"dot"},
  {left:"69%",top:"38%",size:1,color:"rgba(245,200,90,.92)",anim:"pFast1",dur:3.8,delay:1.1,shape:"dot"},
  {left:"81%",top:"82%",size:2,color:"rgba(160,85,20,.52)",anim:"pDrift9",dur:16,delay:4.8,shape:"dot"},
  {left:"93%",top:"12%",size:1.6,color:"rgba(220,140,40,.72)",anim:"pBurst1",dur:6.5,delay:2.3,shape:"dot"},
  {left:"2%",top:"42%",size:4,color:"rgba(200,130,40,.15)",anim:"pSlow1",dur:35,delay:12,shape:"dot"},
  {left:"12%",top:"88%",size:1.2,color:"rgba(240,185,70,.88)",anim:"pFast2",dur:4.2,delay:1.7,shape:"dot"},
  {left:"23%",top:"18%",size:2.2,color:"rgba(160,80,20,.7)",anim:"pDrift7",dur:11.5,delay:3.1,shape:"dot"},
  {left:"34%",top:"58%",size:1.8,color:"rgba(220,140,40,.65)",anim:"pDrift8",dur:13,delay:5.4,shape:"dot"},
  {left:"45%",top:"36%",size:1.2,color:"rgba(245,200,90,.9)",anim:"pFast3",dur:3.6,delay:0.6,shape:"dot"},
  {left:"56%",top:"82%",size:2.4,color:"rgba(185,110,30,.6)",anim:"pDrift9",dur:17,delay:7.2,shape:"dot"},
  {left:"67%",top:"52%",size:1.6,color:"rgba(210,150,50,.76)",anim:"pFast1",dur:6,delay:2.8,shape:"dot"},
  {left:"78%",top:"22%",size:2,color:"rgba(160,85,20,.55)",anim:"pBurst2",dur:9,delay:4.1,shape:"dot"},
  {left:"89%",top:"76%",size:1.4,color:"rgba(220,140,40,.8)",anim:"pDrift7",dur:12.5,delay:1.6,shape:"dot"},
  {left:"97%",top:"48%",size:1.8,color:"rgba(240,185,70,.7)",anim:"pSlow1",dur:25,delay:9.5,shape:"dot"},
  {left:"7%",top:"62%",size:1,color:"rgba(245,200,90,.95)",anim:"pFast2",dur:3.4,delay:0.2,shape:"dot"},
  {left:"19%",top:"30%",size:5,color:"rgba(200,130,40,.12)",anim:"pSlow1",dur:38,delay:15,shape:"dot"},
  {left:"30%",top:"72%",size:1.6,color:"rgba(160,80,20,.65)",anim:"pDrift8",dur:10.5,delay:3.9,shape:"dot"},
  {left:"43%",top:"6%",size:1.2,color:"rgba(245,200,90,.92)",anim:"pFast3",dur:4,delay:0.9,shape:"dot"},
  {left:"54%",top:"48%",size:2.8,color:"rgba(185,110,30,.45)",anim:"pDrift9",dur:20,delay:8.8,shape:"dot"},
  {left:"65%",top:"86%",size:1.8,color:"rgba(220,140,40,.68)",anim:"pDrift7",dur:13.5,delay:5.7,shape:"dot"},
  {left:"76%",top:"36%",size:1.4,color:"rgba(240,190,80,.85)",anim:"pFast1",dur:5.5,delay:2,shape:"dot"},
  {left:"87%",top:"62%",size:2.2,color:"rgba(160,85,20,.6)",anim:"pBurst1",dur:8,delay:3.3,shape:"dot"},
  {left:"98%",top:"18%",size:1,color:"rgba(240,185,70,.9)",anim:"pFast2",dur:3.8,delay:1.3,shape:"dot"},
  {left:"10%",top:"45%",size:6,color:"rgba(200,130,40,.1)",anim:"pSlow1",dur:40,delay:18,shape:"dot"},
  {left:"21%",top:"82%",size:1.6,color:"rgba(240,185,70,.76)",anim:"pDrift8",dur:11,delay:4.6,shape:"dot"},
  {left:"33%",top:"22%",size:2,color:"rgba(160,80,20,.62)",anim:"pDrift9",dur:14,delay:6.5,shape:"dot"},
  {left:"44%",top:"68%",size:1.2,color:"rgba(245,200,90,.88)",anim:"pFast3",dur:4.5,delay:1,shape:"dot"},
  {left:"55%",top:"14%",size:2.6,color:"rgba(185,110,30,.52)",anim:"pDrift7",dur:16,delay:7.8,shape:"dot"},
  {left:"66%",top:"58%",size:1.8,color:"rgba(220,140,40,.7)",anim:"pFast1",dur:6.2,delay:2.4,shape:"dot"},
  {left:"77%",top:"8%",size:1.4,color:"rgba(210,150,50,.85)",anim:"pBurst2",dur:7.5,delay:3.8,shape:"dot"},
  {left:"88%",top:"44%",size:2.4,color:"rgba(160,85,20,.48)",anim:"pSlow1",dur:30,delay:11,shape:"dot"},
  {left:"99%",top:"78%",size:1,color:"rgba(240,185,70,.9)",anim:"pFast2",dur:3.2,delay:0.5,shape:"dot"},
  {left:"6%",top:"20%",size:3.6,color:"rgba(200,130,40,.2)",anim:"pDrift8",dur:22,delay:9,shape:"dot"},
  {left:"17%",top:"60%",size:1.8,color:"rgba(240,185,70,.72)",anim:"pDrift9",dur:12,delay:4,shape:"dot"},
  {left:"28%",top:"36%",size:1.2,color:"rgba(160,80,20,.68)",anim:"pFast3",dur:5,delay:1.5,shape:"dot"},
  {left:"39%",top:"50%",size:2.2,color:"rgba(220,140,40,.62)",anim:"pDrift7",dur:13,delay:6.2,shape:"dot"},
  {left:"50%",top:"28%",size:1.6,color:"rgba(245,200,90,.78)",anim:"pFast1",dur:4.5,delay:1.8,shape:"dot"},
  {left:"61%",top:"72%",size:2,color:"rgba(185,110,30,.6)",anim:"pBurst1",dur:8.5,delay:3.5,shape:"dot"},
  {left:"72%",top:"16%",size:1.4,color:"rgba(160,85,20,.65)",anim:"pDrift9",dur:15,delay:7,shape:"dot"},
  {left:"83%",top:"56%",size:2.8,color:"rgba(220,140,40,.42)",anim:"pSlow1",dur:28,delay:10,shape:"dot"},
  {left:"94%",top:"90%",size:1.2,color:"rgba(240,185,70,.82)",anim:"pFast2",dur:4,delay:2.2,shape:"dot"},
  {left:"3%",top:"32%",size:1.8,color:"rgba(160,80,20,.7)",anim:"pDrift8",dur:11,delay:5.2,shape:"dot"},
  {left:"14%",top:"76%",size:2.4,color:"rgba(200,130,40,.52)",anim:"pDrift7",dur:14.5,delay:6.8,shape:"dot"},
  {left:"25%",top:"44%",size:1,color:"rgba(245,200,90,.95)",anim:"pFast3",dur:3.5,delay:0.7,shape:"dot"},
  {left:"36%",top:"16%",size:2,color:"rgba(210,150,50,.68)",anim:"pBurst2",dur:9.5,delay:4.5,shape:"dot"},
  {left:"47%",top:"60%",size:1.6,color:"rgba(185,110,30,.65)",anim:"pDrift9",dur:12,delay:5.8,shape:"dot"},
  {left:"58%",top:"30%",size:3,color:"rgba(160,85,20,.25)",anim:"pSlow1",dur:35,delay:14,shape:"dot"},
  {left:"69%",top:"80%",size:1.4,color:"rgba(220,140,40,.76)",anim:"pFast1",dur:5.8,delay:2.7,shape:"dot"},
  {left:"80%",top:"46%",size:2.2,color:"rgba(240,185,70,.62)",anim:"pDrift8",dur:10,delay:4.3,shape:"dot"},
  {left:"91%",top:"10%",size:1.8,color:"rgba(160,80,20,.78)",anim:"pDrift7",dur:13,delay:6,shape:"dot"},
];

function Particles({ list }: { list: Particle[] }) {
  return (
    <div style={{ position:"absolute", inset:0, overflow:"hidden", pointerEvents:"none", zIndex:0 }}>
      {list.map((p, i) => (
        <div key={i} style={{
          position:"absolute", left:p.left, top:p.top,
          width:p.size, height:p.size, borderRadius:"50%", background:p.color,
          animationName:p.anim, animationDuration:`${p.dur}s`,
          animationDelay:`${p.delay}s`, animationTimingFunction:"ease-in-out",
          animationIterationCount:"infinite", animationFillMode:"both",
        }} />
      ))}
    </div>
  );
}

/* ── ScorePill ─────────────────────────────────────────────────────────────── */
function ScorePill({ score, rank }: { score: number; rank: number }) {
  const textColor = rank===1 ? T.goldHi : rank===2 ? S.silverHi : rank===3 ? B.bronzeHi : "rgba(180,150,80,.7)";
  const shadow = rank===1 ? "0 0 10px rgba(200,130,0,.7)" : rank===2 ? "0 0 8px rgba(150,190,220,.5)" : "0 0 8px rgba(180,100,30,.5)";
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", flexShrink:0, gap:3 }}>
      <span style={{ fontSize:22, fontWeight:900, lineHeight:1, color:textColor, fontFamily:font, textShadow:shadow }}>
        {fa(Math.round(score))}
      </span>
      <span style={{ fontSize:13, color:"rgba(180,140,30,.6)", fontFamily:font, fontWeight:600 }}>امتیاز</span>
    </div>
  );
}

/* ── Divider ────────────────────────────────────────────────────────────────── */
function VDivider() {
  return <div style={{ width:1, height:70, background:"linear-gradient(to bottom,transparent,rgba(200,150,50,.4),transparent)", flexShrink:0 }} />;
}

/* ── DefaultTribeIcon — SVG پیش‌فرض قبیله ───────────────────────────────────── */
function DefaultTribeIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="20" fill="rgba(255,255,255,.04)" />
      {/* Shield */}
      <path d="M20 6 L30 10 L30 22 C30 28 25 33 20 35 C15 33 10 28 10 22 L10 10 Z" fill={`${color}22`} stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
      {/* Crown */}
      <path d="M14 18 L14 14 L17 16.5 L20 13 L23 16.5 L26 14 L26 18 Z" fill={color} opacity="0.85" />
      {/* Jewel */}
      <circle cx="20" cy="23" r="2.5" fill={color} opacity="0.7" />
      {/* Base line */}
      <rect x="14" y="18" width="12" height="1.5" rx="0.75" fill={color} opacity="0.5" />
    </svg>
  );
}

/* ── AvatarCircle ───────────────────────────────────────────────────────────── */
function AvatarCircle({ tribe, borderColor, glowColor }: { tribe: TribeEntry; borderColor: string; glowColor: string }) {
  return (
    <div style={{
      width:38, height:38, borderRadius:"50%", marginBottom:6, flexShrink:0,
      border:`1.5px solid ${borderColor}`, boxShadow:`0 0 8px ${glowColor}`,
      background:"rgba(10,8,4,.9)", overflow:"hidden",
      display:"flex", alignItems:"center", justifyContent:"center",
    }}>
      {tribe.logo
        ? <CachedImage src={tribe.logo} alt="" width={38} height={38} style={{ width:38, height:38, objectFit:"cover" }} />
        : <DefaultTribeIcon size={32} color={borderColor} />
      }
    </div>
  );
}

/* ── SmallTribeAvatar — آواتار کوچک برای کارت‌های tier ─────────────────────── */
function SmallTribeAvatar({ tribe, size, borderColor, glowColor }: { tribe: TribeEntry; size: number; borderColor: string; glowColor: string }) {
  return (
    <div style={{
      width:size, height:size, borderRadius:"50%", flexShrink:0,
      border:`1.5px solid ${borderColor}`, boxShadow:`0 0 6px ${glowColor}`,
      background:"rgba(8,6,14,.9)", overflow:"hidden",
      display:"flex", alignItems:"center", justifyContent:"center",
    }}>
      {tribe.logo
        ? <CachedImage src={tribe.logo} alt="" width={size} height={size} style={{ width:size, height:size, objectFit:"cover" }} />
        : <DefaultTribeIcon size={size - 6} color={borderColor} />
      }
    </div>
  );
}

/* ── FoilBorder ────────────────────────────────────────────────────────────── */
function FoilBorder({ foil }: { foil: string }) {
  return (
    <div style={{
      position:"absolute", inset:0, borderRadius:14, zIndex:0, pointerEvents:"none",
      background:foil,
      WebkitMask:"linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0)",
      WebkitMaskComposite:"xor", maskComposite:"exclude", padding:"1.5px",
    }} />
  );
}

/* ── MicroLabel ────────────────────────────────────────────────────────────── */
function MicroLabel({ text, color, dot, border }: { text: string; color: string; dot: string; border: string }) {
  return (
    <div style={{ display:"flex", justifyContent:"center", paddingTop:10 }}>
      <div style={{ display:"inline-flex", alignItems:"center", gap:7, border:`1px solid ${border}`, borderRadius:20, padding:"3px 14px", background:"rgba(5,4,2,.8)" }}>
        <div style={{ width:4, height:4, background:dot, transform:"rotate(45deg)", boxShadow:`0 0 4px ${dot}` }} />
        <span style={{ fontSize:11, fontWeight:700, color, fontFamily:font }}>{text}</span>
        <div style={{ width:4, height:4, background:dot, transform:"rotate(45deg)", boxShadow:`0 0 4px ${dot}` }} />
      </div>
    </div>
  );
}

/* ── Rank1Card ──────────────────────────────────────────────────────────────── */
function Rank1Card({ tribe }: { tribe: TribeEntry }) {
  return (
    <>
      <div dir="rtl" style={{ textAlign:"center", marginBottom:5 }}>
        <span style={{ fontFamily:font, fontWeight:900, fontSize:17, background:T.foil, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text", filter:"drop-shadow(0 0 5px rgba(200,130,0,.55))", letterSpacing:1 }}>۱#</span>
      </div>
    <div dir="rtl" style={{ position:"relative", borderRadius:14, overflow:"hidden", marginBottom:10, background:T.card, boxShadow:T.glow1 }}>
      <FoilBorder foil={T.foil} />
      <div style={{ position:"absolute", inset:0, zIndex:0, pointerEvents:"none", background:"radial-gradient(ellipse 70% 80% at 50% 40%,rgba(200,120,0,.06) 0%,transparent 70%)" }} />
      <Particles list={goldParticles} />
      <div style={{ position:"relative", zIndex:1 }}>
        <MicroLabel text="قبیله پادشاه" color={T.goldTxt} dot={T.gold} border="rgba(200,130,0,.45)" />
        {/* Crest */}
        <div style={{ position:"absolute", left:-18, top:-18, width:200, height:200, zIndex:2, pointerEvents:"none", filter:"drop-shadow(0 0 20px rgba(200,130,0,.4))" }}>
          <CachedImage src={staticAssetUrl.leaderboard("lion-crest-hq.webp")} alt="crest" width={200} height={200} loading="eager" style={{ width:200, height:200, objectFit:"contain", display:"block" }} />
        </div>
        {/* Content row */}
        <div style={{ display:"flex", alignItems:"center", padding:"14px 14px 16px 192px", gap:14, minHeight:110 }}>
          <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", alignItems:"center", textAlign:"center" }}>
            <AvatarCircle tribe={tribe} borderColor={T.gold} glowColor="rgba(200,130,0,.5)" />
            <div style={{ fontSize:22, fontWeight:900, lineHeight:1.15, fontFamily:font, background:T.foil, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text", filter:"drop-shadow(0 0 6px rgba(200,130,0,.45))", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:"100%" }}>{tribe.name}</div>
            <div style={{ fontSize:12, color:"rgba(210,165,40,.7)", marginTop:5, fontFamily:font, fontWeight:500, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:"100%" }}>رهبر: {tribe.chiefName ?? "—"}</div>
            <div style={{ fontSize:14, color:"rgba(180,140,60,.75)", marginTop:3, fontFamily:font, fontWeight:600 }}>{fa(tribe.memberCount)} عضو</div>
          </div>
          <VDivider />
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, flexShrink:0 }}>
            <ScorePill score={tribe.score} rank={1} />
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

/* ── Rank2Card ──────────────────────────────────────────────────────────────── */
function Rank2Card({ tribe }: { tribe: TribeEntry }) {
  return (
    <>
      <div dir="rtl" style={{ textAlign:"center", marginBottom:5 }}>
        <span style={{ fontFamily:font, fontWeight:900, fontSize:17, background:S.foil, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text", filter:"drop-shadow(0 0 5px rgba(120,160,190,.55))", letterSpacing:1 }}>۲#</span>
      </div>
    <div dir="rtl" style={{ position:"relative", borderRadius:14, overflow:"hidden", marginBottom:10, background:S.card, boxShadow:S.glow }}>
      <FoilBorder foil={S.foil} />
      <div style={{ position:"absolute", inset:0, zIndex:0, pointerEvents:"none", background:S.ambient }} />
      <Particles list={silverParticles} />
      <div style={{ position:"relative", zIndex:1 }}>
        <MicroLabel text="قبیله شاهزاده" color={S.silverTxt} dot={S.silverHi} border={S.border} />
        {/* Crest */}
        <div style={{ position:"absolute", left:-18, top:-18, width:200, height:200, zIndex:2, pointerEvents:"none", filter:"drop-shadow(0 0 20px rgba(120,165,200,.4))" }}>
          <CachedImage src={staticAssetUrl.leaderboard("silver-crest.webp")} alt="crest" width={200} height={200} loading="eager" style={{ width:200, height:200, objectFit:"contain", display:"block" }} />
        </div>
        {/* Content row */}
        <div style={{ display:"flex", alignItems:"center", padding:"14px 14px 16px 192px", gap:14, minHeight:110 }}>
          <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", alignItems:"center", textAlign:"center" }}>
            <AvatarCircle tribe={tribe} borderColor={S.silverHi} glowColor="rgba(150,190,220,.5)" />
            <div style={{ fontSize:22, fontWeight:900, lineHeight:1.15, fontFamily:font, background:S.foil, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text", filter:"drop-shadow(0 0 6px rgba(150,200,230,.45))", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:"100%" }}>{tribe.name}</div>
            <div style={{ fontSize:12, color:"rgba(160,195,220,.7)", marginTop:5, fontFamily:font, fontWeight:500, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:"100%" }}>رهبر: {tribe.chiefName ?? "—"}</div>
            <div style={{ fontSize:14, color:"rgba(140,175,200,.75)", marginTop:3, fontFamily:font, fontWeight:600 }}>{fa(tribe.memberCount)} عضو</div>
          </div>
          <VDivider />
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, flexShrink:0 }}>
            <ScorePill score={tribe.score} rank={2} />
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

/* ── Rank3Card ──────────────────────────────────────────────────────────────── */
function Rank3Card({ tribe }: { tribe: TribeEntry }) {
  return (
    <>
      <div dir="rtl" style={{ textAlign:"center", marginBottom:5 }}>
        <span style={{ fontFamily:font, fontWeight:900, fontSize:17, background:B.foil, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text", filter:"drop-shadow(0 0 5px rgba(160,90,20,.55))", letterSpacing:1 }}>۳#</span>
      </div>
    <div dir="rtl" style={{ position:"relative", borderRadius:14, overflow:"hidden", marginBottom:10, background:B.card, boxShadow:B.glow }}>
      <FoilBorder foil={B.foil} />
      <div style={{ position:"absolute", inset:0, zIndex:0, pointerEvents:"none", background:B.ambient }} />
      <Particles list={bronzeParticles} />
      <div style={{ position:"relative", zIndex:1 }}>
        <MicroLabel text="قبیله وزیر" color={B.bronzeTxt} dot={B.bronzeHi} border={B.border} />
        {/* Crest */}
        <div style={{ position:"absolute", left:-18, top:-18, width:200, height:200, zIndex:2, pointerEvents:"none", filter:"drop-shadow(0 0 20px rgba(160,90,20,.4))" }}>
          <CachedImage src={staticAssetUrl.leaderboard("bronze-crest.webp")} alt="crest" width={200} height={200} loading="eager" style={{ width:200, height:200, objectFit:"contain", display:"block" }} />
        </div>
        {/* Content row */}
        <div style={{ display:"flex", alignItems:"center", padding:"14px 14px 16px 192px", gap:14, minHeight:110 }}>
          <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", alignItems:"center", textAlign:"center" }}>
            <AvatarCircle tribe={tribe} borderColor={B.bronzeHi} glowColor="rgba(180,100,30,.5)" />
            <div style={{ fontSize:22, fontWeight:900, lineHeight:1.15, fontFamily:font, background:B.foil, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text", filter:"drop-shadow(0 0 6px rgba(180,100,20,.5))", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:"100%" }}>{tribe.name}</div>
            <div style={{ fontSize:12, color:"rgba(200,140,55,.7)", marginTop:5, fontFamily:font, fontWeight:500, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:"100%" }}>رهبر: {tribe.chiefName ?? "—"}</div>
            <div style={{ fontSize:14, color:"rgba(180,120,50,.75)", marginTop:3, fontFamily:font, fontWeight:600 }}>{fa(tribe.memberCount)} عضو</div>
          </div>
          <VDivider />
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, flexShrink:0 }}>
            <ScorePill score={tribe.score} rank={3} />
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

/* ── Tier design tokens ─────────────────────────────────────────────────────── */
const CH = {
  bg:    "linear-gradient(135deg,#041418 0%,#020d10 55%,#061a20 100%)",
  bdr:   "rgba(0,185,195,.48)",
  glow:  "0 0 14px rgba(0,160,175,.25)",
  badge: "linear-gradient(135deg,#003c48 0%,#007080 50%,#003c48 100%)",
  top:   "linear-gradient(90deg,transparent,rgba(0,200,220,.55),transparent)",
  txt:   "#40d8e8",
  sub:   "rgba(0,185,200,.58)",
  rnk:   "rgba(80,225,240,.9)",
  sep:   "rgba(0,160,180,.18)",
  lbl:   { bg:"rgba(0,80,100,.22)", bdr:"rgba(0,130,150,.32)", color:"rgba(0,210,230,.92)" },
};
const CL = {
  bg:    "linear-gradient(135deg,#0b0814 0%,#06040f 55%,#0f0a1a 100%)",
  bdr:   "rgba(80,52,145,.32)",
  glow:  "0 0 8px rgba(60,38,125,.16)",
  badge: "linear-gradient(135deg,#22103c 0%,#4828a0 50%,#22103c 100%)",
  top:   "linear-gradient(90deg,transparent,rgba(90,50,190,.38),transparent)",
  txt:   "rgba(145,105,210,.78)",
  sub:   "rgba(110,78,175,.5)",
  rnk:   "rgba(150,110,210,.72)",
  sep:   "rgba(80,48,160,.14)",
  lbl:   { bg:"rgba(50,28,120,.18)", bdr:"rgba(80,50,150,.22)", color:"rgba(130,90,195,.8)" },
};
const KN = {
  bg:    "linear-gradient(135deg,#030e09 0%,#020807 55%,#04120b 100%)",
  bdr:   "rgba(32,118,68,.38)",
  glow:  "0 0 10px rgba(24,100,54,.18)",
  badge: "linear-gradient(135deg,#0a3018 0%,#1a7042 50%,#0a3018 100%)",
  top:   "linear-gradient(90deg,transparent,rgba(40,160,85,.42),transparent)",
  txt:   "#48b872",
  sub:   "rgba(38,105,60,.55)",
  rnk:   "rgba(60,165,90,.72)",
  sep:   "rgba(28,105,55,.16)",
  lbl:   { bg:"rgba(12,70,32,.2)", bdr:"rgba(30,110,58,.28)", color:"rgba(55,155,85,.85)" },
};
const CI = {
  bg:    "linear-gradient(135deg,#0c0c0c 0%,#090909 55%,#0e0e0e 100%)",
  bdr:   "rgba(85,85,85,.28)",
  glow:  "0 0 8px rgba(50,50,50,.12)",
  badge: "linear-gradient(135deg,#1c1c1c 0%,#3a3a3a 50%,#1c1c1c 100%)",
  top:   "linear-gradient(90deg,transparent,rgba(110,110,110,.25),transparent)",
  txt:   "rgba(155,155,155,.8)",
  sub:   "rgba(115,115,115,.55)",
  rnk:   "rgba(145,145,145,.72)",
  lbl:   { bg:"rgba(45,45,45,.3)", bdr:"rgba(90,90,90,.3)", color:"rgba(135,135,135,.88)" },
};

function TierLabel({ tokens, text }: { tokens: { bg:string; bdr:string; color:string }; text:string }) {
  return (
    <span style={{ fontSize:10, fontWeight:700, color:tokens.color, background:tokens.bg,
      border:`1px solid ${tokens.bdr}`, borderRadius:10, padding:"1px 9px", fontFamily:font, flexShrink:0 }}>
      {text}
    </span>
  );
}

/* Commander ارشد (ranks 4-10) */
function CommanderHiCard({ tribe }: { tribe: TribeEntry }) {
  return (
    <div dir="rtl" style={{ position:"relative", borderRadius:10, overflow:"hidden", marginBottom:6, background:CH.bg, border:`1px solid ${CH.bdr}`, boxShadow:CH.glow }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:1.5, background:CH.top, pointerEvents:"none" }} />
      <div style={{ display:"flex", alignItems:"center", padding:"9px 12px", gap:9 }}>
        <div style={{ width:32, height:32, borderRadius:7, background:CH.badge, border:"1px solid rgba(0,170,190,.38)",
          display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, boxShadow:"0 0 8px rgba(0,155,175,.32)" }}>
          <span style={{ color:CH.rnk, fontWeight:900, fontSize:12, fontFamily:font }}>{fa(tribe.rank)}</span>
        </div>
        <SmallTribeAvatar tribe={tribe} size={34} borderColor={CH.bdr} glowColor="rgba(0,185,195,.3)" />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:800, fontFamily:font, color:CH.txt, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{tribe.name}</div>
          <div style={{ display:"flex", gap:6, marginTop:3, alignItems:"center" }}>
            <TierLabel tokens={CH.lbl} text="فرمانده ارشد" />
            <span style={{ fontSize:11, color:CH.sub, fontFamily:font, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{tribe.chiefName ?? "—"}</span>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", flexShrink:0, gap:1 }}>
          <span style={{ fontSize:14, fontWeight:900, color:CH.txt, fontFamily:font }}>{fa(Math.round(tribe.score))}</span>
          <span style={{ fontSize:10, color:CH.sub, fontFamily:font }}>{fa(tribe.memberCount)} نفر</span>
        </div>
      </div>
    </div>
  );
}

/* Commander معمولی (ranks 11-20) */
function CommanderLoCard({ tribe }: { tribe: TribeEntry }) {
  return (
    <div dir="rtl" style={{ position:"relative", borderRadius:10, overflow:"hidden", marginBottom:6, background:CL.bg, border:`1px solid ${CL.bdr}`, boxShadow:CL.glow }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:CL.top, pointerEvents:"none" }} />
      <div style={{ display:"flex", alignItems:"center", padding:"8px 12px", gap:9 }}>
        <div style={{ width:30, height:30, borderRadius:6, background:CL.badge, border:"1px solid rgba(100,60,180,.28)",
          display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <span style={{ color:CL.rnk, fontWeight:900, fontSize:11, fontFamily:font }}>{fa(tribe.rank)}</span>
        </div>
        <SmallTribeAvatar tribe={tribe} size={32} borderColor={CL.bdr} glowColor="rgba(80,52,145,.3)" />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:800, fontFamily:font, color:CL.txt, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{tribe.name}</div>
          <div style={{ display:"flex", gap:6, marginTop:2, alignItems:"center" }}>
            <TierLabel tokens={CL.lbl} text="فرمانده" />
            <span style={{ fontSize:11, color:CL.sub, fontFamily:font, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{tribe.chiefName ?? "—"}</span>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", flexShrink:0, gap:1 }}>
          <span style={{ fontSize:13, fontWeight:900, color:CL.txt, fontFamily:font }}>{fa(Math.round(tribe.score))}</span>
          <span style={{ fontSize:10, color:CL.sub, fontFamily:font }}>{fa(tribe.memberCount)} نفر</span>
        </div>
      </div>
    </div>
  );
}

/* Knight شوالیه (ranks 21-50) */
function KnightCard({ tribe }: { tribe: TribeEntry }) {
  return (
    <div dir="rtl" style={{ position:"relative", borderRadius:9, overflow:"hidden", marginBottom:5, background:KN.bg, border:`1px solid ${KN.bdr}`, boxShadow:KN.glow }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:KN.top, pointerEvents:"none" }} />
      <div style={{ display:"flex", alignItems:"center", padding:"8px 11px", gap:9 }}>
        <div style={{ width:28, height:28, borderRadius:6, background:KN.badge, border:"1px solid rgba(30,105,58,.32)",
          display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <span style={{ color:KN.rnk, fontWeight:900, fontSize:11, fontFamily:font }}>{fa(tribe.rank)}</span>
        </div>
        <SmallTribeAvatar tribe={tribe} size={30} borderColor={KN.bdr} glowColor="rgba(32,118,68,.25)" />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:700, fontFamily:font, color:KN.txt, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{tribe.name}</div>
          <div style={{ display:"flex", gap:6, marginTop:2, alignItems:"center" }}>
            <TierLabel tokens={KN.lbl} text="شوالیه" />
            <span style={{ fontSize:10, color:KN.sub, fontFamily:font, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{tribe.chiefName ?? "—"}</span>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", flexShrink:0, gap:1 }}>
          <span style={{ fontSize:12, fontWeight:800, color:KN.txt, fontFamily:font }}>{fa(Math.round(tribe.score))}</span>
          <span style={{ fontSize:10, color:KN.sub, fontFamily:font }}>{fa(tribe.memberCount)} نفر</span>
        </div>
      </div>
    </div>
  );
}

/* Citizen شهروند (ranks 51+) — همان ساختار شوالیه، رنگ خاکستری */
function CitizenCard({ tribe }: { tribe: TribeEntry }) {
  return (
    <div dir="rtl" style={{ position:"relative", borderRadius:9, overflow:"hidden", marginBottom:5, background:CI.bg, border:`1px solid ${CI.bdr}`, boxShadow:CI.glow }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:1, background:CI.top, pointerEvents:"none" }} />
      <div style={{ display:"flex", alignItems:"center", padding:"8px 11px", gap:9 }}>
        <div style={{ width:28, height:28, borderRadius:6, background:CI.badge, border:"1px solid rgba(90,90,90,.28)",
          display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <span style={{ color:CI.rnk, fontWeight:900, fontSize:11, fontFamily:font }}>{fa(tribe.rank)}</span>
        </div>
        <SmallTribeAvatar tribe={tribe} size={30} borderColor={CI.bdr} glowColor="rgba(85,85,85,.2)" />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:700, fontFamily:font, color:CI.txt, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{tribe.name}</div>
          <div style={{ display:"flex", gap:6, marginTop:2, alignItems:"center" }}>
            <TierLabel tokens={CI.lbl} text="شهروند" />
            <span style={{ fontSize:10, color:CI.sub, fontFamily:font, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{tribe.chiefName ?? "—"}</span>
          </div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", flexShrink:0, gap:1 }}>
          <span style={{ fontSize:12, fontWeight:800, color:CI.txt, fontFamily:font }}>{fa(Math.round(tribe.score))}</span>
          <span style={{ fontSize:10, color:CI.sub, fontFamily:font }}>{fa(tribe.memberCount)} نفر</span>
        </div>
      </div>
    </div>
  );
}

/* Dispatcher */
function TierCard({ tribe }: { tribe: TribeEntry }) {
  if (tribe.rank <= 10) return <CommanderHiCard tribe={tribe} />;
  if (tribe.rank <= 20) return <CommanderLoCard tribe={tribe} />;
  if (tribe.rank <= 50) return <KnightCard tribe={tribe} />;
  return <CitizenCard tribe={tribe} />;
}

/* ── My Tribe Rank Banner ───────────────────────────────────────────────────── */
function MyTribeBanner({ tribe }: { tribe: TribeEntry }) {
  const [, navigate] = useLocation();
  const rankColor =
    tribe.rank === 1 ? { bg:"linear-gradient(135deg,#1a0f00 0%,#2a1800 55%,#1a0f00 100%)", border:"rgba(200,130,0,.55)", glow:"rgba(200,130,0,.3)", badge:"linear-gradient(135deg,#6a3c00 0%,#c08808 50%,#6a3c00 100%)", badgeTxt:"#fde060", txt:"rgba(255,220,80,.9)", sub:"rgba(200,160,60,.65)", btnBg:"linear-gradient(135deg,#4a2200 0%,#a07010 50%,#4a2200 100%)", btnBorder:"rgba(200,130,0,.45)", btnTxt:"rgba(255,230,100,.95)" } :
    tribe.rank === 2 ? { bg:"linear-gradient(135deg,#080c10 0%,#060a0e 55%,#0a1018 100%)", border:"rgba(140,165,180,.45)", glow:"rgba(120,160,190,.25)", badge:"linear-gradient(135deg,#1a2530 0%,#5a7888 50%,#1a2530 100%)", badgeTxt:"#d8eaf5", txt:"rgba(200,220,235,.9)", sub:"rgba(160,195,220,.65)", btnBg:"linear-gradient(135deg,#12202a 0%,#3a6070 50%,#12202a 100%)", btnBorder:"rgba(140,165,180,.4)", btnTxt:"rgba(200,230,245,.95)" } :
    tribe.rank === 3 ? { bg:"linear-gradient(135deg,#130800 0%,#0e0500 55%,#160900 100%)", border:"rgba(180,110,40,.45)", glow:"rgba(160,90,20,.25)", badge:"linear-gradient(135deg,#3a1800 0%,#7a4818 50%,#3a1800 100%)", badgeTxt:"#f0b060", txt:"rgba(230,160,70,.9)", sub:"rgba(180,120,55,.65)", btnBg:"linear-gradient(135deg,#2a1000 0%,#683808 50%,#2a1000 100%)", btnBorder:"rgba(180,110,40,.4)", btnTxt:"rgba(240,180,90,.95)" } :
    { bg:"linear-gradient(135deg,#0a0812 0%,#07060f 55%,#0c0a16 100%)", border:"rgba(100,80,180,.35)", glow:"rgba(90,70,160,.2)", badge:"linear-gradient(135deg,#1a1530 0%,#3a2870 50%,#1a1530 100%)", badgeTxt:"rgba(200,180,255,.85)", txt:"rgba(180,160,240,.85)", sub:"rgba(140,120,200,.55)", btnBg:"linear-gradient(135deg,#12102a 0%,#2a2260 50%,#12102a 100%)", btnBorder:"rgba(100,80,180,.35)", btnTxt:"rgba(190,170,255,.9)" };

  const rankLabel =
    tribe.rank === 1 ? "پادشاه" :
    tribe.rank === 2 ? "شاهزاده" :
    tribe.rank === 3 ? "وزیر" :
    tribe.rank <= 10 ? "فرمانده ارشد" :
    tribe.rank <= 30 ? "فرمانده" :
    tribe.rank <= 60 ? "شوالیه" : "شهروند";

  return (
    <div dir="rtl" style={{
      position:"fixed", bottom:"calc(env(safe-area-inset-bottom) + 14px)",
      left:"50%", transform:"translateX(-50%)",
      width:"calc(100% - 28px)", maxWidth:402,
      zIndex:60,
      display:"flex", alignItems:"center", gap:10,
      background:rankColor.bg,
      border:`1px solid ${rankColor.border}`,
      borderRadius:16,
      padding:"10px 12px",
      boxShadow:`0 0 24px ${rankColor.glow},0 8px 32px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.04)`,
      backdropFilter:"blur(12px)",
      WebkitBackdropFilter:"blur(12px)",
    } as React.CSSProperties}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:1.5, borderRadius:"16px 16px 0 0",
        background:`linear-gradient(90deg,transparent,${rankColor.border},transparent)`, pointerEvents:"none" }} />
      {/* Rank badge */}
      <div style={{
        width:42, height:42, borderRadius:"50%", flexShrink:0,
        background:rankColor.badge,
        border:`2px solid ${rankColor.border}`,
        display:"flex", alignItems:"center", justifyContent:"center",
        boxShadow:`0 0 12px ${rankColor.glow}`,
      }}>
        <span style={{ color:rankColor.badgeTxt, fontWeight:900, fontSize:13, fontFamily:font }}>
          #{fa(tribe.rank)}
        </span>
      </div>
      {/* Text */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:800, color:rankColor.txt, fontFamily:font }}>رتبه قبیله شما</div>
        <div style={{ fontSize:10, color:rankColor.sub, fontFamily:font, marginTop:1 }}>
          {rankLabel} — {tribe.name}
        </div>
      </div>
      {/* Button */}
      <button onClick={() => navigate("/tribe")} style={{
        display:"inline-flex", alignItems:"center", gap:5,
        background:rankColor.btnBg,
        border:`1px solid ${rankColor.btnBorder}`, borderRadius:10,
        padding:"7px 12px", color:rankColor.btnTxt,
        fontSize:12, fontWeight:800, fontFamily:font,
        cursor:"pointer", flexShrink:0,
        boxShadow:`0 0 10px ${rankColor.glow}`,
      }}>
        <span>برو به قبیله</span>
        <span style={{ fontSize:10 }}>←</span>
      </button>
    </div>
  );
}

/* ── Campaign types ─────────────────────────────────────────────────────────── */
interface Campaign {
  id: number;
  prizeTitle: string;
  awardAt: string;
  status: "active" | "ended";
  winnerTribeId: number | null;
  winnerTribeName: string | null;
  winnerChiefName: string | null;
  createdAt: string;
}

/* ── Countdown hook ─────────────────────────────────────────────────────────── */
function useCountdown(awardAt: string) {
  const calc = () => {
    const diff = new Date(awardAt).getTime() - Date.now();
    if (diff <= 0) return { days:0, hours:0, minutes:0, seconds:0, done:true };
    const s = Math.floor(diff / 1000);
    return { days:Math.floor(s/86400), hours:Math.floor((s%86400)/3600), minutes:Math.floor((s%3600)/60), seconds:s%60, done:false };
  };
  const [cd, setCd] = useState(calc);
  useEffect(() => {
    const t = setInterval(() => setCd(calc()), 1000);
    return () => clearInterval(t);
  }, [awardAt]);
  return cd;
}

/* ── Confetti burst ─────────────────────────────────────────────────────────── */
const CONFETTI_COLORS = ["#fde060","#f0b820","#a855f7","#38bdf8","#4ade80","#f472b6","#fff"];
function ConfettiBurst() {
  const pieces = Array.from({ length: 28 }, (_, i) => ({
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    cx: `${(Math.random() - 0.5) * 260}px`,
    cy: `${-(40 + Math.random() * 200)}px`,
    cr: `${(Math.random() - 0.5) * 720}deg`,
    dur: 1.6 + Math.random() * 1.2,
    delay: Math.random() * 0.6,
    size: 5 + Math.random() * 7,
    shape: Math.random() > 0.5 ? "circle" : "rect",
  }));
  return (
    <div style={{ position:"absolute", inset:0, pointerEvents:"none", overflow:"visible", zIndex:10 }}>
      {pieces.map((p, i) => (
        <div key={i} style={{
          position:"absolute", left:"50%", bottom:"30%",
          width: p.shape === "circle" ? p.size : p.size * 1.4, height: p.shape === "circle" ? p.size : p.size * 0.7,
          borderRadius: p.shape === "circle" ? "50%" : 2,
          background: p.color,
          // @ts-ignore
          "--cx": p.cx, "--cy": p.cy, "--cr": p.cr,
          animation: `confettiA ${p.dur}s ${p.delay}s ease-out infinite`,
          opacity: 0,
        } as React.CSSProperties} />
      ))}
    </div>
  );
}

/* ── Countdown box ─────────────────────────────────────────────────────────── */
function CdBox({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
      <div style={{
        minWidth:56, height:58, borderRadius:12,
        background:"rgba(0,0,0,.45)",
        border:"1px solid rgba(0,210,255,.22)",
        backdropFilter:"blur(6px)",
        display:"flex", alignItems:"center", justifyContent:"center",
        animation:"cdPulse 3s ease-in-out infinite",
        position:"relative", overflow:"hidden",
      }}>
        <div style={{ position:"absolute", inset:0, background:"linear-gradient(135deg,rgba(0,210,255,.06) 0%,transparent 60%,rgba(150,80,255,.06) 100%)" }} />
        <span style={{ fontSize:26, fontWeight:900, color:"#e0f8ff", fontFamily:font, position:"relative", zIndex:1 }}>{fa(value)}</span>
      </div>
      <span style={{ fontSize:9, color:"rgba(100,200,255,.6)", fontFamily:font, fontWeight:600, letterSpacing:0.5 }}>{label}</span>
    </div>
  );
}

/* ── Active campaign card ────────────────────────────────────────────────────── */
function CampaignReminderCard({ campaign, onHistoryClick }: { campaign: Campaign; onHistoryClick: () => void }) {
  const cd = useCountdown(campaign.awardAt);
  const awardDate = new Date(campaign.awardAt);
  const awardStr = awardDate.toLocaleDateString("fa-IR", { month:"long", day:"numeric" }) + " — " + awardDate.toLocaleTimeString("fa-IR", { hour:"2-digit", minute:"2-digit" });
  return (
    <div dir="rtl" style={{
      position:"relative", borderRadius:18, overflow:"hidden",
      marginBottom:16, padding:"18px 16px 20px",
      background:"linear-gradient(135deg,#04060e 0%,#070412 40%,#030810 100%)",
      border:"1px solid rgba(0,210,255,.18)",
      boxShadow:"0 0 30px rgba(0,180,255,.12),0 0 60px rgba(120,60,255,.08),inset 0 1px 0 rgba(0,210,255,.1)",
    }}>
      {/* Animated liquid gradient background */}
      <div style={{
        position:"absolute", inset:0, zIndex:0, pointerEvents:"none",
        background:"linear-gradient(270deg,rgba(0,180,255,.07),rgba(120,60,255,.09),rgba(0,220,180,.06),rgba(80,20,180,.08))",
        backgroundSize:"400% 400%", animation:"liquidFlow 8s ease infinite",
      }} />
      {/* Glass shimmer sweep */}
      <div style={{ position:"absolute", inset:0, zIndex:1, pointerEvents:"none", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:0, left:0, width:"40%", height:"100%",
          background:"linear-gradient(90deg,transparent,rgba(255,255,255,.07),transparent)",
          animation:"glassShimmer 4s ease-in-out infinite", transform:"skewX(-20deg)" }} />
      </div>
      {/* Top glow line */}
      <div style={{ position:"absolute", top:0, left:0, right:0, height:1.5, zIndex:2,
        background:"linear-gradient(90deg,transparent,rgba(0,210,255,.7),rgba(150,80,255,.7),transparent)" }} />

      {/* Content */}
      <div style={{ position:"relative", zIndex:3 }}>
        {/* ستاره‌های تزئینی */}
        <div style={{ textAlign:"center", fontSize:13, letterSpacing:6, marginBottom:6, opacity:0.5 }}>✦ ✦ ✦</div>
        {/* عنوان جایزه ویژه */}
        <div style={{ textAlign:"center", marginBottom:4 }}>
          <div style={{
            display:"inline-block",
            fontSize:28, fontWeight:900, fontFamily:font, letterSpacing:1,
            background:"linear-gradient(118deg,#ffe066 0%,#fff5a0 20%,#ffd700 40%,#ffb700 55%,#fff0a0 70%,#ffd700 85%,#ffe066 100%)",
            WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text",
            backgroundSize:"200%", animation:"liquidFlow 3s ease infinite",
            filter:"drop-shadow(0 0 14px rgba(255,210,0,.7)) drop-shadow(0 0 30px rgba(255,170,0,.4))",
            textShadow:"none",
          }}>جایزه ویژه</div>
        </div>
        {/* خط جداکننده درخشان */}
        <div style={{ display:"flex", alignItems:"center", gap:8, justifyContent:"center", marginBottom:14 }}>
          <div style={{ height:1, width:40, background:"linear-gradient(90deg,transparent,rgba(255,210,60,.5))" }} />
          <div style={{ width:5, height:5, borderRadius:"50%", background:"#ffd700", boxShadow:"0 0 8px #ffd700" }} />
          <div style={{ height:1, width:40, background:"linear-gradient(270deg,transparent,rgba(255,210,60,.5))" }} />
        </div>
        {/* نام جایزه */}
        <div style={{ textAlign:"center", marginBottom:6 }}>
          <div style={{ fontSize:20, fontWeight:900, fontFamily:font,
            background:"linear-gradient(118deg,#00c8ff 0%,#a855f7 40%,#fde060 70%,#00c8ff 100%)",
            WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text",
            filter:"drop-shadow(0 0 8px rgba(0,200,255,.4))",
            backgroundSize:"200%", animation:"liquidFlow 4s ease infinite",
          }}>{campaign.prizeTitle}</div>
          <div style={{ fontSize:13, color:"rgba(150,200,255,.5)", fontFamily:font, marginTop:6 }}>تعیین برنده {awardStr}</div>
        </div>
        {/* Countdown */}
        {(() => {
          const showDays = cd.days * 24 + cd.hours > 72;
          const sep = <div style={{ color:"rgba(0,210,255,.4)", fontSize:24, fontWeight:900, alignSelf:"flex-start", marginTop:12 }}>:</div>;
          return (
            <div dir="ltr" style={{ display:"flex", justifyContent:"center", gap:10, marginBottom:14 }}>
              {showDays && <><CdBox value={cd.days} label="روز" />{sep}</>}
              <CdBox value={cd.hours} label="ساعت" />
              {sep}
              <CdBox value={cd.minutes} label="دقیقه" />
              {sep}
              <CdBox value={cd.seconds} label="ثانیه" />
            </div>
          );
        })()}
        {/* Bottom note */}
        <div style={{ textAlign:"center", fontSize:12, color:"rgba(100,180,255,.45)", fontFamily:font }}>
          قبیله‌ای که در لحظه موعد رتبه اول باشد برنده می‌شود
        </div>
      </div>
    </div>
  );
}

/* ── Radiate ring ─────────────────────────────────────────────────────────── */
function RadiateRing({ size, delay, color }: { size: number; delay: number; color: string }) {
  return (
    <div style={{
      position:"absolute", left:"50%", top:"50%",
      width:size, height:size,
      marginLeft:-size/2, marginTop:-size/2,
      borderRadius:"50%",
      border:`1.5px solid ${color}`,
      animation:`radiateRing 2.5s ${delay}s ease-out infinite`,
      pointerEvents:"none",
    }} />
  );
}

/* ── Win celebration card ────────────────────────────────────────────────────── */
function CampaignWinCard({ campaign, onHistoryClick }: { campaign: Campaign; onHistoryClick: () => void }) {
  return (
    <div dir="rtl" style={{
      position:"relative", borderRadius:18, overflow:"hidden",
      marginBottom:16, padding:"20px 16px 22px",
      background:"linear-gradient(135deg,#0a0700 0%,#100b00 45%,#080600 100%)",
      border:"1px solid rgba(253,190,60,.35)",
      boxShadow:"0 0 40px rgba(255,200,0,.18),0 0 80px rgba(200,140,0,.1),inset 0 1px 0 rgba(255,220,80,.15)",
    }}>
      <ConfettiBurst />
      {/* Radiate rings */}
      <div style={{ position:"absolute", inset:0, pointerEvents:"none" }}>
        <RadiateRing size={80} delay={0} color="rgba(255,210,0,.35)" />
        <RadiateRing size={130} delay={0.8} color="rgba(255,180,0,.22)" />
        <RadiateRing size={190} delay={1.6} color="rgba(255,150,0,.12)" />
      </div>
      {/* Liquid glow background */}
      <div style={{ position:"absolute", inset:0, zIndex:0, pointerEvents:"none",
        background:"linear-gradient(270deg,rgba(255,180,0,.06),rgba(255,120,0,.04),rgba(255,220,80,.07),rgba(200,100,0,.05))",
        backgroundSize:"400% 400%", animation:"liquidFlow 6s ease infinite",
      }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height:2, zIndex:2,
        background:"linear-gradient(90deg,transparent,rgba(255,220,60,.9),rgba(255,180,0,.9),transparent)" }} />

      <div style={{ position:"relative", zIndex:3 }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
          <button onClick={onHistoryClick} style={{ background:"rgba(255,200,0,.08)", border:"1px solid rgba(255,200,0,.2)", borderRadius:8, padding:"4px 10px", color:"rgba(255,200,60,.7)", fontSize:10, fontFamily:font, fontWeight:700, cursor:"pointer" }}>تاریخچه 🏆</button>
          <span style={{ fontSize:11, color:"rgba(255,200,60,.7)", fontFamily:font, fontWeight:700 }}>نتیجه کمپین</span>
          <div style={{ width:60 }} />
        </div>
        {/* Trophy */}
        <div style={{ textAlign:"center", marginBottom:12, animation:"winPop .6s ease forwards" }}>
          <div style={{ fontSize:52, animation:"winGlow 2s ease-in-out infinite" }}>🏆</div>
        </div>
        {/* Prize */}
        <div style={{ textAlign:"center", marginBottom:14 }}>
          <div style={{ fontSize:11, color:"rgba(255,200,60,.55)", fontFamily:font, marginBottom:4 }}>جایزه</div>
          <div style={{ fontSize:18, fontWeight:900, fontFamily:font,
            background:"linear-gradient(118deg,#fde060 0%,#f0b820 40%,#fffbe0 70%,#fde060 100%)",
            WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text",
            filter:"drop-shadow(0 0 8px rgba(255,210,0,.5))",
          }}>{campaign.prizeTitle}</div>
        </div>
        {/* Winner info */}
        {campaign.winnerTribeName ? (
          <div style={{
            background:"rgba(255,200,0,.06)", border:"1px solid rgba(255,200,0,.15)",
            borderRadius:14, padding:"14px 16px", textAlign:"center",
            backdropFilter:"blur(4px)",
          }}>
            <div style={{ fontSize:10, color:"rgba(255,200,60,.5)", fontFamily:font, marginBottom:6 }}>قبیله برنده</div>
            <div style={{ fontSize:20, fontWeight:900, fontFamily:font,
              background:"linear-gradient(118deg,#fde060,#f0b820,#fffbe0,#fde060)",
              WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text",
            }}>{campaign.winnerTribeName}</div>
            <div style={{ fontSize:12, color:"rgba(255,200,60,.65)", fontFamily:font, marginTop:4, fontWeight:600 }}>
              رهبر: {campaign.winnerChiefName ?? "—"}
            </div>
          </div>
        ) : (
          <div style={{ textAlign:"center", fontSize:12, color:"rgba(255,200,60,.5)", fontFamily:font }}>
            در حال تعیین برنده...
          </div>
        )}
      </div>
    </div>
  );
}

/* ── History panel ────────────────────────────────────────────────────────────── */
function HistoryPanel({ history, onClose }: { history: Campaign[]; onClose: () => void }) {
  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("fa-IR", { year:"numeric", month:"long", day:"numeric" });
  }
  return (
    <div style={{ position:"fixed", inset:0, zIndex:200, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
      <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.6)", backdropFilter:"blur(4px)" }} onClick={onClose} />
      <div style={{
        position:"relative", borderRadius:"20px 20px 0 0",
        background:"linear-gradient(180deg,#08060f 0%,#050408 100%)",
        border:"1px solid rgba(253,190,60,.25)", borderBottom:"none",
        maxHeight:"70vh", overflowY:"auto",
        animation:"histSlideUp .35s ease",
        zIndex:1,
      }}>
        <div style={{ position:"sticky", top:0, background:"#08060f", borderBottom:"1px solid rgba(255,200,0,.1)", padding:"14px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }} dir="rtl">
          <span style={{ fontSize:15, fontWeight:800, fontFamily:font, color:"rgba(255,210,80,.9)" }}>تاریخچه جوایز 🏆</span>
          <button onClick={onClose} style={{ background:"rgba(255,255,255,.06)", border:"none", borderRadius:"50%", width:28, height:28, color:"rgba(255,255,255,.6)", cursor:"pointer", fontSize:16 }}>×</button>
        </div>
        <div dir="rtl" style={{ padding:"12px 16px 24px" }}>
          {history.length === 0 ? (
            <div style={{ textAlign:"center", padding:"32px 0", color:"rgba(200,160,60,.4)", fontFamily:font, fontSize:13 }}>تاریخچه‌ای ثبت نشده</div>
          ) : history.map((c) => (
            <div key={c.id} style={{
              borderRadius:12, padding:"12px 14px", marginBottom:10,
              background:"rgba(255,200,0,.04)", border:"1px solid rgba(255,200,0,.1)",
            }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:800, fontFamily:font, color:"rgba(255,210,80,.85)", marginBottom:3 }}>{c.prizeTitle}</div>
                  <div style={{ fontSize:10, color:"rgba(200,160,60,.5)", fontFamily:font }}>{fmtDate(c.awardAt)}</div>
                </div>
                {c.winnerTribeName && (
                  <div style={{ textAlign:"left", flexShrink:0 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,200,60,.8)", fontFamily:font }}>{c.winnerTribeName}</div>
                    <div style={{ fontSize:9, color:"rgba(200,160,60,.5)", fontFamily:font }}>{c.winnerChiefName}</div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Mock data (DEV only) ───────────────────────────────────────────────────── */
const MOCK_NAMES  = ["قهرمانان","شیران","آتشین","تندر","پیروزان","جاودان","عقابان","بانیان","خورشیدان","ماهان","سیمرغ","یلان","شاهین","گرگان","پلنگان","کوه‌نشینان","دریاوران","آذرخش","رعدوبرق","کاوشگران"];
const MOCK_CHIEFS = ["علی محمدی","رضا کریمی","فاطمه احمدی","مریم صادقی","حسن رحیمی","زهرا موسوی","امیر جعفری","سارا نجفی","محمد علوی","لیلا کاظمی","داوود اکبری","نیلوفر حسینی","بهنام شریفی","پریسا رضایی","سعید ملکی"];
function makeMockTribes(count: number): TribeEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    rank: i + 4,
    id: -(i + 4),
    name: `${MOCK_NAMES[i % MOCK_NAMES.length]} ${Math.floor(i / MOCK_NAMES.length) > 0 ? Math.floor(i / MOCK_NAMES.length) + 1 : ""}`.trim(),
    logo: null,
    chiefName: MOCK_CHIEFS[i % MOCK_CHIEFS.length],
    memberCount: Math.max(1, Math.round(95 - i * 1.2)),
    totalPurchase: Math.max(0, 8000000 - i * 110000),
    score: Math.max(0, 9500 - i * 130),
    members: [],
  }));
}

/* ── Page ────────────────────────────────────────────────────────────────────── */
const SEEN_KEY = (id: number) => `lb_camp_seen_${id}`;
function markSeen(id: number) { localStorage.setItem(SEEN_KEY(id), String(Date.now())); }
function isSeen(id: number): boolean {
  const t = Number(localStorage.getItem(SEEN_KEY(id)) ?? 0);
  return t > 0 && Date.now() - t < 3600_000; // 1 hour
}

export default function LeaderboardPage() {
  const { token } = useAuth();
  const [, navigate] = useLocation();
  const [tribes, setTribes] = useState<TribeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [myTribeId, setMyTribeId] = useState<number | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [history, setHistory] = useState<Campaign[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [hiddenCampaignId, setHiddenCampaignId] = useState<number | null>(null);

  useEffect(() => {
    if (import.meta.env.DEV) {
      const mock3: TribeEntry[] = [
        { rank:1, id:-1, name:"شیران طلایی", logo:null, chiefName:"امیر سلطانی", memberCount:120, totalPurchase:15000000, score:14200, members:[] },
        { rank:2, id:-2, name:"عقابان نقره", logo:null, chiefName:"سارا رضایی", memberCount:95, totalPurchase:11000000, score:10800, members:[] },
        { rank:3, id:-3, name:"پلنگان برنز", logo:null, chiefName:"حسن کریمی", memberCount:78, totalPurchase:8500000, score:8300, members:[] },
      ];
      setTribes([...mock3, ...makeMockTribes(70)]);
      setMyTribeId(-1); // mock: user's tribe is rank 1 (to show floating widget)
      // Mock: show an active campaign in DEV (5 days from now)
      const mockCamp: Campaign = { id:999, prizeTitle:"لپ‌تاپ گیمینگ ایسوس ROG", awardAt: new Date(Date.now() + 5 * 24 * 3600_000 + 3 * 3600_000 + 27 * 60_000).toISOString(), status:"active", winnerTribeId:null, winnerTribeName:null, winnerChiefName:null, createdAt: new Date().toISOString() };
      const mockEnded: Campaign = { id:998, prizeTitle:"گوشی سامسونگ S25", awardAt: new Date(Date.now() - 7 * 24 * 3600_000).toISOString(), status:"ended", winnerTribeId:-1, winnerTribeName:"شیران طلایی", winnerChiefName:"امیر سلطانی", createdAt: new Date(Date.now() - 30 * 24 * 3600_000).toISOString() };
      setCampaign(mockCamp);
      setHistory([mockCamp, mockEnded]);
      setLoading(false);
      return;
    }
    fetch(`${API}/api/leaderboard`)
      .then(r => r.json()).then(setTribes).catch(() => {}).finally(() => setLoading(false));
    fetch(`${API}/api/leaderboard/campaign`)
      .then(r => r.ok ? r.json() : null).then(c => { if (c) setCampaign(c); }).catch(() => {});
    fetch(`${API}/api/leaderboard/campaign/history`)
      .then(r => r.json()).then(setHistory).catch(() => {});
  }, []);

  useEffect(() => {
    if (!token || import.meta.env.DEV) return;
    const h = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API}/api/tribe/me`, { headers: h }).then(r => r.ok ? r.json() : null),
      fetch(`${API}/api/tribe/my-membership`, { headers: h }).then(r => r.ok ? r.json() : null),
    ]).then(([myTribe, myMembership]) => {
      if (myTribe?.id) setMyTribeId(myTribe.id);
      else if (myMembership?.tribeId) setMyTribeId(myMembership.tribeId);
    }).catch(() => {});
  }, [token]);

  // Mark ended campaign as seen after first render
  useEffect(() => {
    if (campaign?.status === "ended") {
      if (isSeen(campaign.id)) {
        setHiddenCampaignId(campaign.id);
      } else {
        markSeen(campaign.id);
      }
    }
  }, [campaign]);

  const showCampaign = campaign && hiddenCampaignId !== campaign.id;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

      {/* History panel overlay */}
      {showHistory && <HistoryPanel history={history} onClose={() => setShowHistory(false)} />}

      {/* Custom sticky header */}
      <div style={{
        position:"fixed", top:0, left:"50%", transform:"translateX(-50%)",
        width:"100%", maxWidth:430, zIndex:50,
        background:"linear-gradient(180deg,rgba(6,4,14,.97) 0%,rgba(6,4,14,.92) 80%,transparent 100%)",
        paddingTop:"env(safe-area-inset-top)",
      }}>
        <div dir="rtl" style={{ display:"flex", alignItems:"center", padding:"10px 14px 10px", gap:12 }}>
          <button
            onClick={() => window.history.back()}
            style={{
              display:"flex", alignItems:"center", justifyContent:"center",
              width:36, height:36, borderRadius:"50%", border:"none", cursor:"pointer",
              background:"rgba(200,130,0,.12)", color:T.goldTxt, flexShrink:0,
            }}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
            <Trophy className="w-4 h-4" style={{ color:T.goldTxt }} />
            <span style={{ fontSize:16, fontWeight:900, background:T.foil, WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text", fontFamily:font, filter:"drop-shadow(0 0 6px rgba(200,130,0,.4))" }}>
              جدول قبایل برتر
            </span>
            <Trophy className="w-4 h-4" style={{ color:T.goldTxt }} />
          </div>
          {/* History icon */}
          <button
            onClick={() => setShowHistory(true)}
            style={{
              display:"flex", alignItems:"center", justifyContent:"center",
              width:36, height:36, borderRadius:"50%", border:"none", cursor:"pointer",
              background:"rgba(255,200,0,.08)", color:"rgba(255,200,60,.7)", flexShrink:0,
              position:"relative",
            }}
            title="تاریخچه جوایز"
          >
            <span style={{ fontSize:16 }}>🏅</span>
            {history.length > 0 && (
              <span style={{ position:"absolute", top:2, right:2, width:8, height:8, borderRadius:"50%", background:"#f0b820", border:"1.5px solid #050402" }} />
            )}
          </button>
        </div>
      </div>

      <div style={{ minHeight:"100vh", background:T.bg, padding:"72px 14px 100px", fontFamily:font }} dir="rtl">

        {/* Campaign reminder section */}
        {showCampaign && campaign.status === "active" && (
          <CampaignReminderCard campaign={campaign} onHistoryClick={() => setShowHistory(true)} />
        )}
        {showCampaign && campaign.status === "ended" && (
          <CampaignWinCard campaign={campaign} onHistoryClick={() => setShowHistory(true)} />
        )}

        {loading ? (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ height: i<=3 ? 130 : 60, borderRadius:14, background:"rgba(255,200,50,.05)", animation:"pDrift1 1.5s ease-in-out infinite" }} />
            ))}
          </div>
        ) : tribes.length === 0 ? (
          <div style={{ textAlign:"center", paddingTop:64, color:"rgba(160,125,55,.5)", fontFamily:font }}>
            <Trophy className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p style={{ fontSize:14 }}>هنوز قبیله‌ای ثبت نشده</p>
          </div>
        ) : (
          <>
            {tribes[0] && <Rank1Card tribe={tribes[0]} />}
            <Rank2Card tribe={tribes[1] ?? { rank:2, id:-2, name:"جای خالی", logo:null, chiefName:null, memberCount:0, totalPurchase:0, score:0, members:[] }} />
            <Rank3Card tribe={tribes[2] ?? { rank:3, id:-3, name:"جای خالی", logo:null, chiefName:null, memberCount:0, totalPurchase:0, score:0, members:[] }} />
            <div style={{ marginTop:6 }}>
              {tribes.slice(3).map(t => <TierCard key={t.id} tribe={t} />)}
            </div>
          </>
        )}
      </div>

      {/* Floating rank widget — all ranks */}
      {!loading && myTribeId && (() => {
        const myTribe = tribes.find(t => t.id === myTribeId);
        if (!myTribe) return null;
        return <MyTribeBanner tribe={myTribe} />;
      })()}
    </>
  );
}
