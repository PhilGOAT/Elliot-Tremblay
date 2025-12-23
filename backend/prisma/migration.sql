-- Migration: Ajouter betType et modifier la contrainte unique

-- 1. Ajouter la colonne betType si elle n'existe pas
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'Bet' AND column_name = 'betType') THEN
        ALTER TABLE "Bet" ADD COLUMN "betType" TEXT DEFAULT 'WINNER';
    END IF;
END $$;

-- 2. Mettre à jour les paris existants qui n'ont pas de betType
UPDATE "Bet" SET "betType" = 'WINNER' WHERE "betType" IS NULL;

-- 3. Supprimer l'ancienne contrainte unique si elle existe
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints
               WHERE constraint_name = 'Bet_userId_matchId_key' AND table_name = 'Bet') THEN
        ALTER TABLE "Bet" DROP CONSTRAINT "Bet_userId_matchId_key";
    END IF;
END $$;

-- 4. Créer la nouvelle contrainte unique si elle n'existe pas
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                   WHERE constraint_name = 'Bet_userId_matchId_betType_key' AND table_name = 'Bet') THEN
        ALTER TABLE "Bet" ADD CONSTRAINT "Bet_userId_matchId_betType_key" UNIQUE ("userId", "matchId", "betType");
    END IF;
END $$;
