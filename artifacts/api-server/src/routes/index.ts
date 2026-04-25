import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import uploadRouter from "./upload";
import videosRouter from "./videos";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(uploadRouter);
router.use(videosRouter);

export default router;
