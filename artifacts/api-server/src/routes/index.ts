import { Router, type IRouter } from "express";
import healthRouter from "./health";
import postsRouter from "./posts";
import commentsRouter from "./comments";
import mediaRouter from "./media";
import usersRouter from "./users";

const router: IRouter = Router();

router.use(healthRouter);
router.use(postsRouter);
router.use(commentsRouter);
router.use(mediaRouter);
router.use(usersRouter);

export default router;
