-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "workosId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "favoriteColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_workosId_key" ON "users"("workosId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
