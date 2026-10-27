-- AlterTable
ALTER TABLE "user" ADD COLUMN     "email_opt_in_at" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "email_verification" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_event" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_verification_user_id_idx" ON "email_verification"("user_id");

-- CreateIndex
CREATE INDEX "email_event_user_id_created_at_idx" ON "email_event"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "email_verification" ADD CONSTRAINT "email_verification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_event" ADD CONSTRAINT "email_event_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
