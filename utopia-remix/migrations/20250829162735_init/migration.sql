-- CreateTable
CREATE TABLE "github_authentication" (
    "user_id" VARCHAR NOT NULL,
    "access_token" VARCHAR NOT NULL,
    "refresh_token" VARCHAR,
    "expires_at" TIMESTAMPTZ(6)
);

-- CreateTable
CREATE TABLE "persistent_session" (
    "key" VARCHAR NOT NULL,
    "auth_id" BYTEA,
    "session" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "accessed_at" TIMESTAMPTZ(6) NOT NULL,
    "session_json" JSONB,

    CONSTRAINT "persistent_session_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "project" (
    "id" SERIAL NOT NULL,
    "proj_id" VARCHAR NOT NULL,
    "owner_id" VARCHAR NOT NULL,
    "title" VARCHAR NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "modified_at" TIMESTAMPTZ(6) NOT NULL,
    "content" BYTEA NOT NULL,
    "deleted" BOOLEAN,
    "github_repository" TEXT,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_i_d" (
    "id" SERIAL NOT NULL,
    "proj_id" VARCHAR NOT NULL,

    CONSTRAINT "project_i_d_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "showcase" (
    "id" SERIAL NOT NULL,
    "proj_id" VARCHAR NOT NULL,
    "index" BIGINT NOT NULL,

    CONSTRAINT "showcase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_configuration" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR NOT NULL,
    "shortcut_config" VARCHAR,
    "theme" VARCHAR,

    CONSTRAINT "user_configuration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_details" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR NOT NULL,
    "email" VARCHAR,
    "name" VARCHAR,
    "picture" VARCHAR,

    CONSTRAINT "user_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_access" (
    "id" SERIAL NOT NULL,
    "project_id" VARCHAR NOT NULL,
    "access_level" INTEGER NOT NULL,
    "modified_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "project_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_collaborators" (
    "id" SERIAL NOT NULL,
    "project_id" VARCHAR NOT NULL,
    "user_id" VARCHAR NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_access_request" (
    "id" SERIAL NOT NULL,
    "project_id" VARCHAR NOT NULL,
    "user_id" VARCHAR NOT NULL,
    "status" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_access_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "unique_github_authentication" ON "github_authentication"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "unique_project" ON "project"("proj_id");

-- CreateIndex
CREATE UNIQUE INDEX "unique_project_i_d" ON "project_i_d"("proj_id");

-- CreateIndex
CREATE UNIQUE INDEX "unique_user_configuration" ON "user_configuration"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "unique_user_details" ON "user_details"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "unique_project_access" ON "project_access"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_collaborators_project_id_user_id_key" ON "project_collaborators"("project_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_access_request_project_id_user_id_key" ON "project_access_request"("project_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_access_request_project_id_token_key" ON "project_access_request"("project_id", "token");

-- AddForeignKey
ALTER TABLE "project_access" ADD CONSTRAINT "project_access_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("proj_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_collaborators" ADD CONSTRAINT "project_collaborators_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("proj_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_collaborators" ADD CONSTRAINT "project_collaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_details"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_access_request" ADD CONSTRAINT "project_access_request_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("proj_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_access_request" ADD CONSTRAINT "project_access_request_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_details"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
