-- CreateEnum
CREATE TYPE "CarryOutcome" AS ENUM ('DELIVERED', 'CALLED_OFF', 'ABANDONED');

-- CreateTable
CREATE TABLE "carry" (
    "id" SERIAL NOT NULL,
    "puzzle_id" TEXT NOT NULL,
    "outcome" "CarryOutcome" NOT NULL,
    "seconds" DOUBLE PRECISION NOT NULL,
    "people" DOUBLE PRECISION NOT NULL,
    "peak" INTEGER NOT NULL,
    "gates" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "carry_puzzle_id_outcome_created_at_idx" ON "carry"("puzzle_id", "outcome", "created_at");
