[1mdiff --git a/frontend/app/dashboard/page.tsx b/frontend/app/dashboard/page.tsx[m
[1mindex a5c170e..a3222f3 100644[m
[1m--- a/frontend/app/dashboard/page.tsx[m
[1m+++ b/frontend/app/dashboard/page.tsx[m
[36m@@ -20,7 +20,7 @@[m [mexport default function DashboardPage() {[m
   const alertCount = alerts.data?.alerts.length ?? 0;[m
 [m
   return ([m
[31m-    <div className="mx-auto w-full max-w-7xl px-4 py-6 space-y-8">[m
[32m+[m[32m    <div className="mx-auto w-full max-w-7xl px-4 py-6 space-y-8 text-gray-900">[m
       <div className="flex items-center justify-between flex-wrap gap-3">[m
         <h1 className="text-2xl font-bold">Dashboard</h1>[m
 [m
[1mdiff --git a/frontend/app/globals.css b/frontend/app/globals.css[m
[1mindex f5c414b..990b995 100644[m
[1m--- a/frontend/app/globals.css[m
[1m+++ b/frontend/app/globals.css[m
[36m@@ -20,3 +20,22 @@[m
 .leaflet-tooltip::before {[m
   border-top-color: #263040 !important;[m
 }[m
[32m+[m
[32m+[m[32m@keyframes dialog-in {[m
[32m+[m[32m  0% {[m
[32m+[m[32m    opacity: 0;[m
[32m+[m[32m    transform: translate(-50%, 24px) scale(0.98);[m
[32m+[m[32m  }[m
[32m+[m[32m  70% {[m
[32m+[m[32m    opacity: 1;[m
[32m+[m[32m  }[m
[32m+[m[32m  100% {[m
[32m+[m[32m    opacity: 1;[m
[32m+[m[32m    transform: translate(-50%, 0) scale(1);[m
[32m+[m[32m  }[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m.animate-dialog-in {[m
[32m+[m[32m  animation: dialog-in 260ms cubic-bezier(0.22, 1, 0.36, 1);[m
[32m+[m[32m  will-change: transform, opacity;[m
[32m+[m[32m}[m
[1mdiff --git a/frontend/app/historical/page.tsx b/frontend/app/historical/page.tsx[m
[1mindex 81773be..a425438 100644[m
[1m--- a/frontend/app/historical/page.tsx[m
[1m+++ b/frontend/app/historical/page.tsx[m
[36m@@ -37,7 +37,7 @@[m [mexport default function HistoricalPage() {[m
   const rows: VehicleHistoryPoint[] = history.data?.vehicles ?? [];[m
 [m
   return ([m
[31m-    <div className="mx-auto w-full max-w-7xl px-4 py-6 space-y-6">[m
[32m+[m[32m    <div className="mx-auto w-full max-w-7xl px-4 py-6 space-y-6 text-gray-900">[m
       <h1 className="text-2xl font-bold">Historical Data</h1>[m
 [m
       {/* Filters */}[m
[36m@@ -49,7 +49,7 @@[m [mexport default function HistoricalPage() {[m
             <select[m
               value={routeId}[m
               onChange={(e) => setRouteId(e.target.value)}[m
[31m-              className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rtd-blue"[m
[32m+[m[32m              className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-rtd-blue"[m
             >[m
               <option value="">All routes</option>[m
               {routes.data?.routes.map((r) => ([m
[36m@@ -116,7 +116,7 @@[m [mexport default function HistoricalPage() {[m
             <p className="text-sm text-gray-500">No data found for this range.</p>[m
           ) : ([m
             <div className="overflow-x-auto">[m
[31m-              <table className="min-w-full text-sm">[m
[32m+[m[32m              <table className="min-w-full text-sm text-gray-800">[m
                 <thead className="bg-gray-50 text-xs uppercase text-gray-500">[m
                   <tr>[m
                     <th className="px-3 py-2 text-left">Time</th>[m
[36m@@ -135,7 +135,7 @@[m [mexport default function HistoricalPage() {[m
                       <td className="px-3 py-2 text-gray-500 whitespace-nowrap">[m
                         {formatDateTime(r.timestamp)}[m
                       </td>[m
[31m-                      <td className="px-3 py-2 font-bold">{r.route_id}</td>[m
[32m+[m[32m                      <td className="px-3 py-2 font-bold text-gray-900">{r.route_id}</td>[m
                       <td className="px-3 py-2 text-gray-700">[m
                         {r.vehicle_label ?? r.vehicle_id ?? "—"}[m
                       </td>[m
[1mdiff --git a/frontend/components/dashboard/FrequencyTable.tsx b/frontend/components/dashboard/FrequencyTable.tsx[m
[1mindex 5f7eb3d..ddc4682 100644[m
[1m--- a/frontend/components/dashboard/FrequencyTable.tsx[m
[1m+++ b/frontend/components/dashboard/FrequencyTable.tsx[m
[36m@@ -32,7 +32,7 @@[m [mexport default function FrequencyTable({ routes }: Props) {[m
 [m
   return ([m
     <div className="overflow-x-auto rounded border border-gray-200">[m
[31m-      <table className="min-w-full text-sm">[m
[32m+[m[32m      <table className="min-w-full text-sm text-gray-800">[m
         <thead className="bg-gray-50 text-xs uppercase text-gray-500">[m
           <tr>[m
             <th className="px-3 py-2 text-left">Route</th>[m
[36m@@ -47,7 +47,7 @@[m [mexport default function FrequencyTable({ routes }: Props) {[m
             .sort((a, b) => a.avg_headway_minutes - b.avg_headway_minutes)[m
             .map((r) => ([m
               <tr key={r.route_id} className="hover:bg-gray-50">[m
[31m-                <td className="px-3 py-2 font-bold">{r.route_short_name}</td>[m
[32m+[m[32m                <td className="px-3 py-2 font-bold text-gray-900">{r.route_short_name}</td>[m
                 <td className="px-3 py-2 text-right">{r.vehicle_count}</td>[m
                 <td className="px-3 py-2 text-right">[m
                   {r.avg_headway_minutes > 0 ? `${r.avg_headway_minutes} min` : "—"}[m
[1mdiff --git a/frontend/components/dashboard/OnTimeChart.tsx b/frontend/components/dashboard/OnTimeChart.tsx[m
[1mindex c480d1b..f85620f 100644[m
[1m--- a/frontend/components/dashboard/OnTimeChart.tsx[m
[1m+++ b/frontend/components/dashboard/OnTimeChart.tsx[m
[36m@@ -32,13 +32,13 @@[m [mexport default function OnTimeChart({ routes }: Props) {[m
           type="number"[m
           domain={[0, 100]}[m
           tickFormatter={(v) => `${v}%`}[m
[31m-          tick={{ fontSize: 11 }}[m
[32m+[m[32m          tick={{ fontSize: 11, fill: "#4b5563" }}[m
         />[m
         <YAxis[m
           type="category"[m
           dataKey="route_short_name"[m
           width={36}[m
[31m-          tick={{ fontSize: 11 }}[m
[32m+[m[32m          tick={{ fontSize: 11, fill: "#1f2937" }}[m
         />[m
         <Tooltip[m
           formatter={(value: number) => [`${value.toFixed(1)}%`, "On time"]}[m
[1mdiff --git a/frontend/components/map/VehicleDialog.tsx b/frontend/components/map/VehicleDialog.tsx[m
[1mindex 9060580..84ebb1b 100644[m
[1m--- a/frontend/components/map/VehicleDialog.tsx[m
[1m+++ b/frontend/components/map/VehicleDialog.tsx[m
[36m@@ -18,7 +18,7 @@[m [mexport default function VehicleDialog({ vehicle: v, onClose }: Props) {[m
   const isEarly = (v.delay_seconds ?? 0) < -60;[m
 [m
   return ([m
[31m-    <div className="absolute bottom-6 left-1/2 z-[9999] w-80 -translate-x-1/2 rounded-xl bg-white shadow-2xl ring-1 ring-black/5">[m
[32m+[m[32m    <div className="animate-dialog-in absolute bottom-6 left-1/2 z-[9999] w-80 -translate-x-1/2 rounded-xl bg-white/95 shadow-2xl ring-1 ring-black/5 backdrop-blur-sm">[m
       {/* Header */}[m
       <div[m
         className="flex items-center justify-between rounded-t-xl px-4 py-3 text-white"[m
[36m@@ -74,7 +74,7 @@[m [mexport default function VehicleDialog({ vehicle: v, onClose }: Props) {[m
         {/* Headway */}[m
         {v.headway_minutes !== null && ([m
           <p className="text-gray-500 text-xs">[m
[31m-            Approx. headway:{" "}[m
[32m+[m[32m            Scheduled headway:{" "}[m
             <span className="font-medium text-gray-800">[m
               {v.headway_minutes} min[m
             </span>[m
