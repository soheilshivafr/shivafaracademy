import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import coursesRouter from "./courses";
import productsRouter from "./products";
import reelsRouter from "./reels";
import settingsRouter from "./settings";
import adminRouter from "./admin";
import uploadRouter from "./upload";
import paymentRouter from "./payment";
import downloadRouter from "./download";
import licensesRouter from "./licenses";
import streamRouter from "./stream";
import tribeRouter from "./tribe";
import walletRouter from "./wallet";
import leaderboardRouter from "./leaderboard";
import adminTribeRouter from "./admin-tribe";
import audioRouter from "./audio";
import lessonManageRouter from "./lesson-manage";
import assistantRouter, { startAssistantJobs } from "./assistant";
import campaignsRouter from "./campaigns";
import aiChatRouter from "./ai-chat";
import channelRouter from "./channel";
import openaiRouter from "./openai";
import financialRouter from "./financial";
import pushRouter from "./push";
import leadScoringRouter, { startFollowUpJobs } from "./lead-scoring";
import knowledgeBaseRouter from "./knowledge-base";
import mtpRouter from "./mtp";
import pagesRouter from "./pages";
import systemStatusRouter from "./system-status";
import itemDiscountRouter from "./item-discount";
import analyticsRouter from "./analytics";
import trackingLinksRouter from "./tracking-links";
import assessmentsRouter from "./assessments";
import { startNewUsersHourlyReportJob } from "../lib/new-users-report";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(coursesRouter);
router.use(productsRouter);
router.use(reelsRouter);
router.use(settingsRouter);
router.use(adminRouter);
router.use(uploadRouter);
router.use(paymentRouter);
router.use(downloadRouter);
router.use(licensesRouter);
router.use(streamRouter);
router.use(tribeRouter);
router.use(walletRouter);
router.use(leaderboardRouter);
router.use(adminTribeRouter);
router.use(audioRouter);
router.use(lessonManageRouter);
router.use(assistantRouter);
router.use(campaignsRouter);
router.use(aiChatRouter);
router.use(channelRouter);
router.use(openaiRouter);
router.use(financialRouter);
router.use(pushRouter);
router.use(leadScoringRouter);
router.use(knowledgeBaseRouter);
router.use(mtpRouter);
router.use(pagesRouter);
router.use(itemDiscountRouter);
router.use(analyticsRouter);
router.use(trackingLinksRouter);
router.use(assessmentsRouter);

router.use(systemStatusRouter);

const backgroundJobsDisabled =
  process.env.DISABLE_BACKGROUND_JOBS === "true" ||
  process.env.DISABLE_BACKGROUND_JOBS === "1";

if (backgroundJobsDisabled) {
  console.log(
    "[jobs] Background jobs disabled via DISABLE_BACKGROUND_JOBS — skipping assistant reminders and lead follow-up timers (staging mode).",
  );
} else {
  startAssistantJobs();
  startFollowUpJobs();
  startNewUsersHourlyReportJob();
}

export default router;
