-- CreateTable
CREATE TABLE "watched_auction" (
    "auction_id" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "watched_auction_pkey" PRIMARY KEY ("auction_id")
);

-- AddForeignKey
ALTER TABLE "watched_auction" ADD CONSTRAINT "watched_auction_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auction"("auction_id") ON DELETE CASCADE ON UPDATE CASCADE;
