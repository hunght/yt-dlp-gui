import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Stethoscope, Activity, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

export default function TubeDoctorPage() {
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

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* System Health Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              System Health
            </CardTitle>
            <CardDescription>Overall yt-dlp library status</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Library Version</span>
                <Badge variant="outline">Checking...</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Python Environment</span>
                <Badge variant="outline">Checking...</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Dependencies</span>
                <Badge variant="outline">Checking...</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Performance Metrics Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Performance Metrics
            </CardTitle>
            <CardDescription>Download speed and success rates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Avg Download Speed</span>
                <Badge variant="outline">-- MB/s</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Success Rate</span>
                <Badge variant="outline">--%</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Failed Downloads</span>
                <Badge variant="outline">--</Badge>
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
              <div className="text-sm text-muted-foreground">
                No issues detected yet. Run diagnostics to check for problems.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-4">
        <Button className="bg-tracksy-blue hover:bg-tracksy-blue/90">
          <Activity className="mr-2 h-4 w-4" />
          Run Full Diagnostics
        </Button>
        <Button variant="outline">
          <CheckCircle className="mr-2 h-4 w-4" />
          Test Download
        </Button>
        <Button variant="outline">
          <XCircle className="mr-2 h-4 w-4" />
          Clear Cache
        </Button>
      </div>

      {/* Detailed Diagnostics Section */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Diagnostics</CardTitle>
          <CardDescription>
            Comprehensive analysis of your yt-dlp setup and performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="py-8 text-center text-muted-foreground">
            <Stethoscope className="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p>Click "Run Full Diagnostics" to start the analysis</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
