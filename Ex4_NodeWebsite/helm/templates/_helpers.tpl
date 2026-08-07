{{/*
Application labels
*/}}
{{- define "devops-app.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end }}

{{/*
Node application selector labels
*/}}
{{- define "devops-app.nodeSelectorLabels" -}}
app: {{ .Values.nodeApp.name }}
app.kubernetes.io/component: application
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Redis selector labels
*/}}
{{- define "devops-app.redisSelectorLabels" -}}
app: {{ .Values.redis.name }}
app.kubernetes.io/component: redis
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}