import { Router } from "express";
import voiceAdvisorRouter from "./voice-advisor";

const router = Router();
router.use(voiceAdvisorRouter);

export default router;
