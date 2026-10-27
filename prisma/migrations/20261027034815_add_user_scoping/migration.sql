/*
  Warnings:

  - The primary key for the `watched_auction` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Added the required column `user_id` to the `watch_filter` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `watched_auction` table without a default value. This is not possible if the table is not empty.

*/
-- Fase 3 (multiusuário): `user_id` passa a ser obrigatório. Como não há como atribuir dono
-- a linhas pré-existentes (v1 era single-user, dados locais descartáveis), limpamos as duas
-- tabelas antes de adicionar a coluna NOT NULL. É no-op num banco novo (replay das migrations
-- em tabela vazia) e torna a migração reproduzível mesmo num banco já populado.
-- auction_match tem FK ON DELETE CASCADE para watch_filter → é limpo junto.
DELETE FROM "watched_auction";
DELETE FROM "watch_filter";

-- AlterTable
ALTER TABLE "watch_filter" ADD COLUMN     "user_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "watched_auction" DROP CONSTRAINT "watched_auction_pkey",
ADD COLUMN     "user_id" UUID NOT NULL,
ADD CONSTRAINT "watched_auction_pkey" PRIMARY KEY ("user_id", "auction_id");

-- CreateIndex
CREATE INDEX "watch_filter_user_id_idx" ON "watch_filter"("user_id");

-- CreateIndex
CREATE INDEX "watched_auction_auction_id_idx" ON "watched_auction"("auction_id");

-- AddForeignKey
ALTER TABLE "watch_filter" ADD CONSTRAINT "watch_filter_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watched_auction" ADD CONSTRAINT "watched_auction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
