-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('active', 'finished', 'cancelled');

-- CreateTable
CREATE TABLE "watch_filter" (
    "id" SERIAL NOT NULL,
    "world" TEXT,
    "pvp_type" TEXT,
    "battleye" TEXT,
    "vocation" TEXT,
    "level_from" INTEGER,
    "level_to" INTEGER,
    "skill_id" TEXT,
    "skill_from" INTEGER,
    "skill_to" INTEGER,
    "search" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "watch_filter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auction" (
    "auction_id" INTEGER NOT NULL,
    "char_name" TEXT NOT NULL,
    "world" TEXT NOT NULL,
    "vocation" TEXT NOT NULL,
    "sex" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "start_at" TIMESTAMPTZ,
    "end_at" TIMESTAMPTZ NOT NULL,
    "min_bid" INTEGER,
    "current_bid" INTEGER,
    "battleye" TEXT,
    "pvp_type" TEXT,
    "flags" JSONB,
    "attributes" JSONB,
    "status" "AuctionStatus" NOT NULL DEFAULT 'active',
    "first_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auction_pkey" PRIMARY KEY ("auction_id")
);

-- CreateTable
CREATE TABLE "auction_match" (
    "id" SERIAL NOT NULL,
    "auction_id" INTEGER NOT NULL,
    "watch_filter_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auction_match_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auction_status_end_at_idx" ON "auction"("status", "end_at");

-- CreateIndex
CREATE INDEX "auction_match_watch_filter_id_idx" ON "auction_match"("watch_filter_id");

-- CreateIndex
CREATE UNIQUE INDEX "auction_match_auction_id_watch_filter_id_key" ON "auction_match"("auction_id", "watch_filter_id");

-- AddForeignKey
ALTER TABLE "auction_match" ADD CONSTRAINT "auction_match_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auction"("auction_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_match" ADD CONSTRAINT "auction_match_watch_filter_id_fkey" FOREIGN KEY ("watch_filter_id") REFERENCES "watch_filter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
