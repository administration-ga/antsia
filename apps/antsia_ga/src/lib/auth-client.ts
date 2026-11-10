"use client"

import { createEngineAuthClient } from "@antsia/api/auth-client"
import { appBasePath } from "./app-path"
import { demoSessionStorage } from "./demo-storage"

/** Client Better Auth d'antsia.ga (proxy `/api/auth/*` de cette origine). */
export const authClient = createEngineAuthClient({ basePath: `${appBasePath()}/api/auth`, storage: demoSessionStorage() })
