import { createClient } from "@supabase/supabase-js"
import {
  shouldUseOfflineLocal,
  createOfflineFrom,
} from "@/lib/mobileSupabaseOffline"
import {
  getCloudSupabaseConfig,
  getLocalSupabaseConfig,
  isLocalSupabasePrimary,
} from "@/lib/runtimeSupabase"

const cloud =
  getCloudSupabaseConfig()
const local =
  getLocalSupabaseConfig()

const supabaseCloudRaw =
  createClient(
    cloud.url,
    cloud.anonKey,
    {
      auth:{
        autoRefreshToken:true,
        persistSession:true,
        detectSessionInUrl:true,
      },
    }
  )


// Supabase browser auth uses a storage lock for the persisted session.
// Several Anaira screens can mount at the same time and request the session
// concurrently; serialize the session-mutating/reading calls so one request
// cannot steal the auth-token lock from another.
let authOperationQueue = Promise.resolve()

function runAuthExclusive(operation) {
  if (typeof window === "undefined") return operation()

  const next = authOperationQueue.then(operation, operation)
  authOperationQueue = next.catch(() => undefined)
  return next
}

const cloudAuthSafe = new Proxy(
  supabaseCloudRaw.auth,
  {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof value !== "function") return value

      if (["getSession", "getUser", "setSession", "refreshSession", "signOut"].includes(property)) {
        return (...args) => runAuthExclusive(() => value.apply(target, args))
      }

      return value.bind(target)
    },
  }
)

export const supabaseCloud = new Proxy(
  supabaseCloudRaw,
  {
    get(target, property, receiver) {
      if (property === "auth") return cloudAuthSafe
      return Reflect.get(target, property, receiver)
    },
  }
)

const localAuth =
  local.url &&
  local.anonKey
    ? createClient(
        local.url,
        local.anonKey,
        {
          auth:{
            autoRefreshToken:true,
            persistSession:true,
            detectSessionInUrl:false,
          },
        }
      )
    : null

function isPcLocal() {
  if (
    typeof window ===
      "undefined"
  ) {
    return false
  }

  const path =
    window.location.pathname ||
    ""

  const superAdmin =
    path ===
      "/super-admin" ||
    path.startsWith(
      "/super-admin/"
    )

  return (
    process.env.NEXT_PUBLIC_ANAIRA_PC_LOCAL_MODE === "true" &&
    !superAdmin
  )
}

async function pcToken() {
  const cloudSession =
    await supabaseCloud.auth
      .getSession()

  if (
    cloudSession?.data
      ?.session
  ) {
    return cloudSession.data.session
      .access_token
  }

  if (
    localAuth
  ) {
    const localSession =
      await localAuth.auth
        .getSession()

    return localSession
      ?.data
      ?.session
      ?.access_token || ""
  }

  return ""
}

class DesktopQueryBuilder {
  constructor(
    table
  ) {
    this.table =
      table
    this.operation =
      "select"
    this.payload =
      null
    this.columns =
      "*"
    this.filters =
      []
    this.orderBy =
      []
    this.limitValue =
      null
    this.rangeValue =
      null
    this.singleMode =
      null
  }

  select(
    columns="*",
    options={}
  ) {
    this.columns =
      columns
    this.count =
      options?.count ||
      null
    return this
  }

  insert(
    values,
    options={}
  ) {
    this.operation =
      "insert"
    this.payload =
      values
    this.returning =
      Boolean(
        options?.returning
      )
    return this
  }

  update(
    values,
    options={}
  ) {
    this.operation =
      "update"
    this.payload =
      values
    this.returning =
      Boolean(
        options?.returning
      )
    return this
  }

  upsert(
    values,
    options={}
  ) {
    this.operation =
      "upsert"
    this.payload =
      values
    this.onConflict =
      options?.onConflict ||
      options?.on_conflict ||
      null
    this.ignoreDuplicates =
      Boolean(
        options?.ignoreDuplicates
      )
    return this
  }

  delete() {
    this.operation =
      "delete"
    return this
  }

  _filter(
    op,
    column,
    value
  ) {
    this.filters.push({
      op,
      column,
      value,
    })
    return this
  }

  eq(c,v) {
    return this._filter(
      "eq",c,v
    )
  }
  neq(c,v) {
    return this._filter(
      "neq",c,v
    )
  }
  gt(c,v) {
    return this._filter(
      "gt",c,v
    )
  }
  gte(c,v) {
    return this._filter(
      "gte",c,v
    )
  }
  lt(c,v) {
    return this._filter(
      "lt",c,v
    )
  }
  lte(c,v) {
    return this._filter(
      "lte",c,v
    )
  }
  is(c,v) {
    return this._filter(
      "is",c,v
    )
  }
  in(c,v) {
    return this._filter(
      "in",c,v
    )
  }
  like(c,v) {
    return this._filter(
      "like",c,v
    )
  }
  ilike(c,v) {
    return this._filter(
      "ilike",c,v
    )
  }
  contains(c,v) {
    return this._filter(
      "contains",c,v
    )
  }

  filter(
    column,
    operator,
    value
  ) {
    this.filters.push({
      op:"filter",
      column,
      operator,
      value,
    })
    return this
  }

  match(
    value
  ) {
    this.filters.push({
      op:"match",
      value,
    })
    return this
  }

  order(
    column,
    options={}
  ) {
    this.orderBy.push({
      column,
      ascending:
        options?.ascending !==
        false,
      nullsFirst:
        options?.nullsFirst ===
        true,
    })
    return this
  }

  limit(
    value
  ) {
    this.limitValue =
      Number(value)
    return this
  }

  range(
    from,
    to
  ) {
    this.rangeValue = {
      from:Number(from),
      to:Number(to),
    }
    return this
  }

  single() {
    this.singleMode =
      "single"
    return this
  }

  maybeSingle() {
    this.singleMode =
      "maybeSingle"
    return this
  }

  returns() {
    return this
  }

  throwOnError() {
    this.throwErrors =
      true
    return this
  }

  async execute() {
    const token =
      await pcToken()

    if (!token) {
      return {
        data:null,
        error:{
          message:
            "Login session expired",
        },
      }
    }

    const response =
      await fetch(
        "/api/desktop/data",
        {
          method:
            "POST",
          headers:{
            "Content-Type":
              "application/json",
            Authorization:
              `Bearer ${token}`,
          },
          body:JSON.stringify({
            table:this.table,
            operation:
              this.operation,
            columns:
              this.columns,
            payload:
              this.payload,
            filters:
              this.filters,
            order:
              this.orderBy,
            limit:
              this.limitValue,
            range:
              this.rangeValue,
            singleMode:
              this.singleMode,
            onConflict:
              this.onConflict,
            ignoreDuplicates:
              this.ignoreDuplicates,
            count:
              this.count,
          }),
          cache:"no-store",
        }
      )

    const result =
      await response
        .json()
        .catch(
          () => ({
            success:false,
            error:
              "Invalid local data response",
          })
        )

    if (
      !response.ok ||
      !result.success
    ) {
      const error={
        message:
          result.error ||
          `Local data request failed (${response.status})`,
      }

      if (
        this.throwErrors
      ) {
        throw new Error(
          error.message
        )
      }

      return {
        data:null,
        error,
      }
    }

    return {
      data:
        Object.prototype
          .hasOwnProperty.call(
            result,
            "data"
          )
          ? result.data
          : null,
      error:null,
      count:
        result.count ??
        null,
    }
  }

  then(
    resolve,
    reject
  ) {
    return this.execute()
      .then(
        resolve,
        reject
      )
  }
}

function getDataClient() {
  return {
    from:
      (...args) =>
        new DesktopQueryBuilder(
          args[0]
        ),
  }
}

export const supabase =
  new Proxy(
    supabaseCloud,
    {
      get(
        target,
        property,
        receiver
      ) {
        if (
          property ===
          "auth"
        ) {
          // Online Cloud Auth, with Local Auth fallback handled by sign-in
          // callers through explicit dual-auth helper in this proxy.
          return new Proxy(
            target.auth,
            {
              get(
                authTarget,
                authProp,
                authReceiver
              ) {
                if (
                  authProp ===
                  "signInWithPassword"
                ) {
                  return async credentials => {
                    /*
                     * Authentication is Cloud-authoritative.
                     *
                     * Use a fresh Cloud Auth client for every explicit login
                     * attempt. This prevents a stale persisted auth client /
                     * Authorization state from affecting the password-login
                     * request after a PC has been switched between Cloud and
                     * Local modes.
                     *
                     * Local Auth is only a fallback for a genuinely
                     * unreachable Cloud Auth service. A Cloud 4xx response
                     * (wrong credentials, disabled user, etc.) must be
                     * returned directly and must NEVER be replaced by a
                     * misleading Local Auth error.
                     */
                    const cloudConfig =
                      getCloudSupabaseConfig()

                    if (
                      !cloudConfig.url ||
                      !cloudConfig.anonKey
                    ) {
                      return {
                        data: {
                          user: null,
                          session: null,
                        },
                        error: {
                          message:
                            "Cloud Supabase configuration is missing",
                        },
                      }
                    }

                    let online

                    try {
                      const freshCloudAuth =
                        createClient(
                          cloudConfig.url,
                          cloudConfig.anonKey,
                          {
                            auth: {
                              autoRefreshToken: false,
                              persistSession: false,
                              detectSessionInUrl: false,
                            },
                          }
                        )

                      online =
                        await freshCloudAuth.auth
                          .signInWithPassword(
                            credentials
                          )

                      /*
                       * Keep the canonical exported Cloud client in sync with
                       * the successful session. AuthProvider and the rest of
                       * the application continue using supabaseCloud normally.
                       */
                      if (
                        !online.error &&
                        online.data?.session
                      ) {
                        await supabaseCloud.auth
                          .setSession({
                            access_token:
                              online.data.session
                                .access_token,
                            refresh_token:
                              online.data.session
                                .refresh_token,
                          })

                        /*
                         * Best-effort Local Auth preparation. It is deliberately
                         * fire-and-forget: Local Auth must never make a valid
                         * Cloud login fail.
                         */
                        if (
                          isPcLocal() &&
                          localAuth
                        ) {
                          void localAuth.auth
                            .signInWithPassword(
                              credentials
                            )
                            .catch(
                              () =>
                                undefined
                            )
                        }

                        return online
                      }
                    } catch (error) {
                      online = {
                        data: {
                          user: null,
                          session: null,
                        },
                        error: {
                          message:
                            error?.message ||
                            "Cloud authentication request failed",
                        },
                      }
                    }

                    /*
                     * Do not fall back to Local Auth for an explicit Cloud
                     * authentication rejection. This keeps Cloud credentials
                     * authoritative and prevents the UI from reporting the
                     * Local 400 as the login error.
                     */
                    const cloudStatus =
                      online?.error?.status ??
                      online?.error?.statusCode ??
                      null

                    const cloudAuthRejected =
                      typeof cloudStatus === "number" &&
                      cloudStatus >= 400 &&
                      cloudStatus < 500

                    if (
                      !cloudAuthRejected &&
                      isPcLocal() &&
                      localAuth
                    ) {
                      try {
                        const offline =
                          await localAuth.auth
                            .signInWithPassword(
                              credentials
                            )

                        if (
                          !offline.error &&
                          offline.data?.session
                        ) {
                          return offline
                        }
                      } catch {
                        // Preserve the original Cloud error below.
                      }
                    }

                    return online
                  }
                }

                if (
                  authProp ===
                  "getSession"
                ) {
                  return async () => {
                    if (
                      !isPcLocal()
                    ) {
                      return authTarget
                        .getSession()
                    }

                    const online =
                      await authTarget
                        .getSession()

                    if (
                      online?.data
                        ?.session
                    ) {
                      return online
                    }

                    return localAuth
                      ? localAuth.auth
                          .getSession()
                      : online
                  }
                }

                if (
                  authProp ===
                  "getUser"
                ) {
                  return async () => {
                    if (
                      !isPcLocal()
                    ) {
                      return authTarget
                        .getUser()
                    }

                    const online =
                      await authTarget
                        .getUser()

                    if (
                      !online.error &&
                      online.data
                        ?.user
                    ) {
                      return online
                    }

                    return localAuth
                      ? localAuth.auth
                          .getUser()
                      : online
                  }
                }

                if (
                  authProp ===
                  "signOut"
                ) {
                  return async options => {
                    const result =
                      await authTarget
                        .signOut(
                          options
                        )

                    if (
                      localAuth
                    ) {
                      await localAuth.auth
                        .signOut()
                    }

                    return result
                  }
                }

                return Reflect.get(
                  authTarget,
                  authProp,
                  authReceiver
                )
              },
            }
          )
        }

        if (
          property ===
          "from"
        ) {
          if (
            shouldUseOfflineLocal()
          ) {
            return (
              ...args
            ) =>
              createOfflineFrom(
                args[0]
              )
          }

          if (
            isPcLocal()
          ) {
            return (
              ...args
            ) =>
              new DesktopQueryBuilder(
                args[0]
              )
          }

          return (
            ...args
          ) =>
            supabaseCloud.from(
              ...args
            )
        }

        if (
          property ===
          "rpc"
        ) {
          return (
            fn,
            args,
            options
          ) =>
            supabaseCloud.rpc(
              fn,
              args,
              options
            )
        }

        return Reflect.get(
          target,
          property,
          receiver
        )
      },
    }
  )

export const supabaseRuntimeMode =
  isLocalSupabasePrimary()
    ? "local-primary"
    : "cloud"
