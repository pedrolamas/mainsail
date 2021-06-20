import {Store} from "vuex"
import _Vue from "vue";
import {RootState} from "@/store/types";

export class WebSocketClient {
    url = ''
    instance: WebSocket | null = null
    maxReconnects  = 5
    reconnectInterval = 1000
    reconnects = 0
    keepAliveTimeout = 1000
    timerId: number | null = null
    store: Store<RootState> | null = null
    waits: Wait[] = []

    constructor (options: WebSocketPluginOptions) {
        this.url = options.url
        this.maxReconnects = options.maxReconnects || 5
        this.reconnectInterval = options.reconnectInterval || 1000
        this.store = options.store
    }

    setUrl(url: string): void {
        this.url = url
    }

    passToStore (eventName: string, event: any): void {
        if (!eventName.startsWith('socket/')) { return }

        this.store?.dispatch(eventName, event)
    }

    connect(): void {
        this.store?.dispatch("socket/setData", { isConnecting: true })
        this.instance = new WebSocket(this.url)

        this.instance.onopen = () => {
            this.reconnects = 0
            this.store?.dispatch('socket/onOpen', event)
        }

        this.instance.onclose = (e) => {
            if (!e.wasClean && this.reconnects < this.maxReconnects) {
                this.reconnects++
                setTimeout(() => {
                    this.connect()
                }, this.reconnectInterval)
            } else this.store?.dispatch('socket/onClose', e)
        }

        this.instance.onerror = () => {
			if (this.instance) this.instance.close()
        }

        this.instance.onmessage = (msg) => {
            const data = JSON.parse(msg.data)
            if (this.store) {
                const wait = this.getWaitById(data.id)
                if (wait && wait.action !== ""){
                    if (data.error && data.error.message) {
                        window.console.error("Response Error: "+wait.action+" > "+data.error.message)
                        if (wait.params) window.console.log(wait.params)

                        this.store?.dispatch(wait.action,
                            Object.assign(wait.actionPreload || {}, {
                                error: data.error,
                                requestParams: wait.params
                            })
                        )
                    } else {
                        let result = data.result
                        if (result === "ok") result = { result: result }
                        if (typeof(result) === "string") result = { result: result }

                        const preload = {}
                        if (wait.actionPreload) Object.assign(preload, wait.actionPreload)
                        Object.assign(preload, { requestParams: wait.params })
                        Object.assign(preload, result)
                        this.store?.dispatch(wait.action, preload)
                    }
                } else this.store?.dispatch('socket/onMessage', data)

				if (wait) this.removeWaitById(wait.id)
            }
        }
    }

    close():void {
        if (this.instance) this.instance.close()
    }

    getWaitById(id: number): Wait | null {
        return this.waits.find((wait: Wait) => wait.id === id) ?? null
    }

    removeWaitById(id: number): void {
        const index = this.waits.findIndex((wait: Wait) => wait.id === id)
        if (index) this.waits.splice(index, 1)
    }

    emit(method: string, params: Params, action = '', actionPreload: Params | null = null):void {
        if (this.instance?.readyState === WebSocket.OPEN) {
            const id = Math.floor(Math.random() * 10000) + 1
            this.waits.push({
                id: id,
                action: action,
                params: params,
                actionPreload: actionPreload,
            })

            const msg = JSON.stringify({
                jsonrpc: '2.0',
                method: method,
                params: params,
                id: id
            })

            this.instance.send(msg)
        }
    }
}

export function WebSocketPlugin<WebSocketPlugin>(Vue: typeof _Vue, options: WebSocketPluginOptions): void {
    const socket = new WebSocketClient(options)
    Vue.prototype.$socket = socket
    Vue.$socket = socket
}

export interface WebSocketPluginOptions {
    url: string
    maxReconnects?: number
    reconnectInterval?: number
    store: Store<RootState>
}

export interface WebSocketClient {
    connect(): void
    close(): void
    emit(method: string, params: Params, action: string, actionPreload: Params | null):void
}

export interface Wait {
    id: number
    action: string
    params: any
    actionPreload?: any
}

interface Params {
    data?: any
    [key: string]: any
}