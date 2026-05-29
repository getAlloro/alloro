import { AuthRequest } from "../../../middleware/auth";
import { UserModel } from "../../../models/UserModel";

export type GbpActorContext = {
  userId: number | null;
  email: string | null;
};

export class GbpActorService {
  static async resolveUserActor(user: AuthRequest["user"]): Promise<GbpActorContext> {
    const email = user?.email?.trim().toLowerCase() || null;
    const tokenUserId = Number(user?.userId);

    if (Number.isFinite(tokenUserId) && tokenUserId > 0) {
      const userById = await UserModel.findById(tokenUserId);
      if (userById) return { userId: userById.id, email: userById.email };
    }

    if (email) {
      const userByEmail = await UserModel.findByEmail(email);
      if (userByEmail) return { userId: userByEmail.id, email: userByEmail.email };
    }

    return { userId: null, email };
  }
}
