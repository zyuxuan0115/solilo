export interface AuthUser {
  uid: string
  email: string | null
}

export type AppEnv = {
  Variables: {
    authUser: AuthUser
    apiKeyUid: string
  }
}
