-- CreateEnum
CREATE TYPE "RunKind" AS ENUM ('ANTS', 'HANDS');

-- CreateTable
CREATE TABLE "puzzle" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "preset" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "reports" INTEGER NOT NULL DEFAULT 0,
    "ant_runs" INTEGER NOT NULL DEFAULT 0,
    "ant_best" DOUBLE PRECISION,
    "hand_runs" INTEGER NOT NULL DEFAULT 0,
    "hand_best" DOUBLE PRECISION,
    "ip_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "puzzle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run" (
    "id" SERIAL NOT NULL,
    "puzzle_id" TEXT NOT NULL,
    "kind" "RunKind" NOT NULL,
    "seconds" DOUBLE PRECISION NOT NULL,
    "seed" INTEGER NOT NULL,
    "ip_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report" (
    "puzzle_id" TEXT NOT NULL,
    "ip_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_pkey" PRIMARY KEY ("puzzle_id","ip_hash")
);

-- CreateIndex
CREATE UNIQUE INDEX "puzzle_hash_key" ON "puzzle"("hash");

-- CreateIndex
CREATE INDEX "puzzle_hidden_preset_created_at_idx" ON "puzzle"("hidden", "preset", "created_at");

-- CreateIndex
CREATE INDEX "puzzle_hidden_preset_ant_runs_idx" ON "puzzle"("hidden", "preset", "ant_runs");

-- CreateIndex
CREATE INDEX "run_puzzle_id_kind_seconds_idx" ON "run"("puzzle_id", "kind", "seconds");

-- AddForeignKey
ALTER TABLE "run" ADD CONSTRAINT "run_puzzle_id_fkey" FOREIGN KEY ("puzzle_id") REFERENCES "puzzle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_puzzle_id_fkey" FOREIGN KEY ("puzzle_id") REFERENCES "puzzle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
