import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Stethoscope,
  Activity,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  TestTube,
  Trash2,
  ExternalLink,
  Loader2,
  TrendingUp,
  Shield,
  Wifi,
  Download
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { trpcClient } from "../../utils/trpc";
import { toast } from "sonner";
import type { TubeDoctorReport, DiagnosticResult } from "@/api/routers/tube-doctor";

export default function TubeDoctorPage() {
  const [testUrl, setTestUrl] = useState("");
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
  const [isTestingUrl, setIsTestingUrl] = useState(false);
  const [diagnosticsReport, setDiagnosticsReport] = useState<TubeDoctorReport | null>(null);
  const [urlTestResult, setUrlTestResult] = useState<DiagnosticResult | null>(null);

  // Query hooks for individual components
  const { data: systemHealth, refetch: refetchSystemHealth } = api.tubeDoctor.getSystemHealth.useQuery();
  const { data: performanceMetrics, refetch: refetchPerformanceMetrics } = api.tubeDoctor.getPerformanceMetrics.useQuery();

  // Mutation for clearing cache
  const clearCacheMutation = api.tubeDoctor.clearCache.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Cache cleared successfully");
      } else {
        toast.error(`Failed to clear cache: ${result.message}`);
      }
    },
    onError: (error) => {
      toast.error(`Failed to clear cache: ${error.message}`);
    },
  });

  const handleRunFullDiagnostics = async () => {
    setIsRunningDiagnostics(true);
    try {
      const result = await api.tubeDoctor.runFullDiagnostics.query();
      setDiagnosticsReport(result);

      // Refresh individual components
      refetchSystemHealth();
      refetchPerformanceMetrics();

      toast.success("Diagnostics completed");
    } catch (error) {
      toast.error("Failed to run diagnostics");
      console.error("Diagnostics error:", error);
    } finally {
      setIsRunningDiagnostics(false);
    }
  };

  const handleTestUrl = async () => {
    if (!testUrl.trim()) {
      toast.error("Please enter a URL to test");
      return;
    }

    try {
      new URL(testUrl); // Validate URL format
    } catch {
      toast.error("Please enter a valid URL");
      return;
    }

    setIsTestingUrl(true);
    try {
      const result = await api.tubeDoctor.testUrl.query({ url: testUrl });
      setUrlTestResult(result);

      if (result.passed) {
        toast.success("URL test passed");
      } else {
        toast.error("URL test failed");
      }
    } catch (error) {
      toast.error("Failed to test URL");
      console.error("URL test error:", error);
    } finally {
      setIsTestingUrl(false);
    }
  };

  const handleClearCache = () => {
    clearCacheMutation.mutate();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
      case "passed":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "warning":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      case "error":
      case "critical":
      case "failed":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
    }
  };

  const getStatusIcon = (status: string, passed?: boolean) => {
    if (passed === true) return <CheckCircle className="h-4 w-4 text-green-600" />;
    if (passed === false) return <XCircle className="h-4 w-4 text-red-600" />;

    switch (status) {
      case "healthy":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case "error":
      case "critical":
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="mb-6 flex items-center gap-3">
        <Stethoscope className="h-8 w-8 text-tracksy-blue" />
        <div>
          <h1 className="text-3xl font-bold text-tracksy-blue">Tube Doctor</h1>
          <p className="text-muted-foreground">
            Diagnose and optimize your yt-dlp library performance
          </p>
        </div>
      </div>

      {/* Overall Status Card */}
      {diagnosticsReport && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getStatusIcon(diagnosticsReport.overallStatus)}
              Overall System Status
            </CardTitle>
            <CardDescription>
              System health summary based on latest diagnostics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Badge className={getStatusColor(diagnosticsReport.overallStatus)}>
              {diagnosticsReport.overallStatus.toUpperCase()}
            </Badge>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* System Health Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              System Health
            </CardTitle>
            <CardDescription>Overall yt-dlp library status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Library Version</span>
                <Badge variant="outline">
                  {systemHealth?.ytDlpVersion || "Checking..."}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Python Environment</span>
                <Badge variant="outline">
                  {systemHealth?.pythonVersion ? "Available" : "Checking..."}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">FFmpeg</span>
                <Badge className={systemHealth?.ffmpegAvailable ?
                  "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                  {systemHealth?.ffmpegAvailable ? "Available" : "Missing"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Network</span>
                <Badge className={systemHealth?.networkConnectivity ?
                  "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                  <Wifi className="h-3 w-3 mr-1" />
                  {systemHealth?.networkConnectivity ? "Connected" : "Issues"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Performance Metrics Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Performance Metrics
            </CardTitle>
            <CardDescription>Download speed and success rates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Avg Download Speed</span>
                <Badge variant="outline">
                  {performanceMetrics?.avgDownloadSpeed
                    ? `${performanceMetrics.avgDownloadSpeed.toFixed(1)} MB/s`
                    : "-- MB/s"
                  }
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Success Rate</span>
                <Badge variant="outline">
                  {performanceMetrics ? `${performanceMetrics.successRate.toFixed(1)}%` : "--%"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Failed Downloads</span>
                <Badge variant="outline">
                  {performanceMetrics?.failedDownloads ?? "--"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Issues & Recommendations Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Issues & Recommendations
            </CardTitle>
            <CardDescription>Potential problems and fixes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {diagnosticsReport?.recommendations.length ? (
                <ScrollArea className="h-32">
                  <div className="space-y-2">
                    {diagnosticsReport.recommendations.map((rec, index) => (
                      <div key={index} className="text-sm p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded">
                        {rec}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {diagnosticsReport ? "No issues detected!" : "Run diagnostics to check for problems."}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-4">
        <Button
          className="bg-tracksy-blue hover:bg-tracksy-blue/90"
          onClick={handleRunFullDiagnostics}
          disabled={isRunningDiagnostics}
        >
          {isRunningDiagnostics ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Activity className="mr-2 h-4 w-4" />
          )}
          Run Full Diagnostics
        </Button>
        <Button
          variant="outline"
          onClick={handleClearCache}
          disabled={clearCacheMutation.isPending}
        >
          {clearCacheMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="mr-2 h-4 w-4" />
          )}
          Clear Cache
        </Button>
      </div>

      {/* URL Test Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="h-5 w-5" />
            Test Download URL
          </CardTitle>
          <CardDescription>
            Test if a specific URL is accessible and downloadable
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="test-url">URL to test</Label>
              <Input
                id="test-url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleTestUrl}
                disabled={isTestingUrl}
              >
                {isTestingUrl ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <TestTube className="mr-2 h-4 w-4" />
                )}
                Test URL
              </Button>
            </div>
          </div>

          {urlTestResult && (
            <div className={`p-4 rounded-lg border ${urlTestResult.passed
              ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
              : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                {getStatusIcon("", urlTestResult.passed)}
                <span className="font-medium">
                  {urlTestResult.passed ? "Test Passed" : "Test Failed"}
                </span>
              </div>
              <p className="text-sm">{urlTestResult.message}</p>
              {urlTestResult.details && (
                <details className="mt-2">
                  <summary className="text-sm font-medium cursor-pointer">Error Details</summary>
                  <pre className="text-xs mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded overflow-auto">
                    {urlTestResult.details}
                  </pre>
                </details>
              )}
              {urlTestResult.recommendation && (
                <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
                  <p className="text-sm"><strong>Recommendation:</strong> {urlTestResult.recommendation}</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailed Diagnostics Section */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Diagnostics</CardTitle>
          <CardDescription>
            Comprehensive analysis of your yt-dlp setup and performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          {diagnosticsReport ? (
            <div className="space-y-6">
              {/* Diagnostic Tests */}
              <div>
                <h3 className="text-lg font-semibold mb-3">Diagnostic Test Results</h3>
                <div className="space-y-3">
                  {diagnosticsReport.diagnosticTests.map((test, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 border rounded-lg">
                      {getStatusIcon("", test.passed)}
                      <div className="flex-1">
                        <h4 className="font-medium">{test.testName}</h4>
                        <p className="text-sm text-muted-foreground">{test.message}</p>
                        {test.details && (
                          <details className="mt-2">
                            <summary className="text-sm font-medium cursor-pointer">Details</summary>
                            <pre className="text-xs mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded overflow-auto">
                              {test.details}
                            </pre>
                          </details>
                        )}
                        {test.recommendation && (
                          <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
                            <p className="text-sm"><strong>Recommendation:</strong> {test.recommendation}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Performance Analysis */}
              {performanceMetrics && performanceMetrics.commonErrors.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">Common Error Analysis</h3>
                  <div className="space-y-2">
                    {performanceMetrics.commonErrors.map((error, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-red-50 dark:bg-red-900/20 rounded">
                        <span className="text-sm font-mono text-red-700 dark:text-red-300 truncate flex-1 mr-2">
                          {error.error}
                        </span>
                        <Badge variant="outline" className="text-red-600">
                          {error.count} times
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* System Issues */}
              {systemHealth && systemHealth.issues.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3">System Issues</h3>
                  <div className="space-y-2">
                    {systemHealth.issues.map((issue, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded">
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                        <span className="text-sm">{issue}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <Stethoscope className="mx-auto mb-4 h-12 w-12 opacity-50" />
              <p>Click "Run Full Diagnostics" to start the analysis</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
