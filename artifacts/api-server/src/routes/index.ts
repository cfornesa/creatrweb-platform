import { Router, type IRouter } from "express";
import healthRouter from "./health";
import postsRouter from "./posts";
import commentsRouter from "./comments";
import mediaRouter from "./media";
import usersRouter from "./users";
import siteSettingsRouter from "./site-settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(postsRouter);
router.use(commentsRouter);
router.use(mediaRouter);
router.use(usersRouter);
router.use(siteSettingsRouter);

export default router;
