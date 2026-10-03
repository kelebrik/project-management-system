-- The project team named at creation: product owner and the hardware and software TPMs (the sponsor is the business customer).
ALTER TABLE "Project" ADD COLUMN "productOwner" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN "hwTpm" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Project" ADD COLUMN "swTpm" TEXT NOT NULL DEFAULT '';
