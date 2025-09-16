# Custodian Widget Tab Implementation

## Current Tab Structure
The custodian management already has a tabs interface with:
- **Profile** - Basic custodian information
- **Status** - Verification and activation status
- **Documents** - Document management
- **Users** - User management
- **Activity** - Activity logs

## Adding Widget Tab

### 1. Update CustodianManagementTab.tsx

Add the Widget tab to the existing TabsList (around line 175-180):

```typescript
<TabsList className="grid w-full grid-cols-6 bg-gray-800 p-1 rounded-md">
  <TabsTrigger value="profile">Profile</TabsTrigger>
  <TabsTrigger value="status">Status</TabsTrigger>
  <TabsTrigger value="documents">Documents</TabsTrigger>
  <TabsTrigger value="users">Users</TabsTrigger>
  <TabsTrigger value="widget">Widget</TabsTrigger>  {/* NEW */}
  <TabsTrigger value="activity">Activity</TabsTrigger>
</TabsList>
```

Add the Widget TabsContent (after line 221):

```typescript
<TabsContent value="widget" className="space-y-4">
  <CustodianWidgetManager
    custodian={selectedCustodian}
    currentUser={currentUser}
    onUpdate={handleStatusUpdate}
  />
</TabsContent>
```

### 2. Create CustodianWidgetManager Component

Create new file: `/components/admin/CustodianWidgetManager.tsx`

```typescript
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Code2,
  Key,
  Globe,
  Palette,
  BarChart3,
  Copy,
  RefreshCw,
  Trash2,
  Shield,
  AlertCircle,
  CheckCircle,
  Loader2,
  ExternalLink,
  Eye,
  EyeOff
} from 'lucide-react';
import { Custodian } from '@/lib/custodians';

interface CustodianWidgetManagerProps {
  custodian: Custodian;
  currentUser: any;
  onUpdate: (custodian: Custodian) => void;
}

export function CustodianWidgetManager({
  custodian,
  currentUser,
  onUpdate
}: CustodianWidgetManagerProps) {
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [widgetEnabled, setWidgetEnabled] = useState(custodian.widgetEnabled || false);
  const [allowedDomains, setAllowedDomains] = useState<string[]>(
    custodian.widgetSettings?.allowedDomains || []
  );
  const [newDomain, setNewDomain] = useState('');
  const [primaryColor, setPrimaryColor] = useState(
    custodian.widgetSettings?.primaryColor || '#3B82F6'
  );

  // Generate embed code
  const embedCode = `<!-- TrustRails Widget -->
<script src="https://cdn.trustrails.com/widget/v1/trustrails-widget.js"></script>
<trustrails-widget
  custodian-id="${custodian.id}"
  api-key="${custodian.widgetSettings?.apiKeyPrefix || 'YOUR_API_KEY'}..."
  primary-color="${primaryColor}"
  environment="production">
</trustrails-widget>`;

  const handleToggleWidget = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/custodians/${custodian.id}/widget`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          widgetEnabled: !widgetEnabled
        }),
      });

      if (response.ok) {
        setWidgetEnabled(!widgetEnabled);
        onUpdate({ ...custodian, widgetEnabled: !widgetEnabled });
      }
    } catch (error) {
      console.error('Error toggling widget:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateApiKey = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/custodians/${custodian.id}/widget/api-key`, {
        method: 'POST',
      });

      if (response.ok) {
        const { apiKey: newKey } = await response.json();
        setApiKey(newKey);
        setShowApiKey(true);
        // Update custodian with new key prefix
        onUpdate({
          ...custodian,
          widgetSettings: {
            ...custodian.widgetSettings,
            apiKeyPrefix: newKey.substring(0, 8),
            apiKeyCreatedAt: new Date()
          }
        });
      }
    } catch (error) {
      console.error('Error generating API key:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeApiKey = async () => {
    if (!confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/admin/custodians/${custodian.id}/widget/api-key`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setApiKey(null);
        onUpdate({
          ...custodian,
          widgetSettings: {
            ...custodian.widgetSettings,
            apiKey: undefined,
            apiKeyPrefix: undefined
          }
        });
      }
    } catch (error) {
      console.error('Error revoking API key:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDomain = async () => {
    if (!newDomain) return;

    const updatedDomains = [...allowedDomains, newDomain];
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/custodians/${custodian.id}/widget`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          widgetSettings: {
            ...custodian.widgetSettings,
            allowedDomains: updatedDomains
          }
        }),
      });

      if (response.ok) {
        setAllowedDomains(updatedDomains);
        setNewDomain('');
      }
    } catch (error) {
      console.error('Error adding domain:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveDomain = async (domain: string) => {
    const updatedDomains = allowedDomains.filter(d => d !== domain);
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/custodians/${custodian.id}/widget`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          widgetSettings: {
            ...custodian.widgetSettings,
            allowedDomains: updatedDomains
          }
        }),
      });

      if (response.ok) {
        setAllowedDomains(updatedDomains);
      }
    } catch (error) {
      console.error('Error removing domain:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Widget Status Card */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Code2 className="h-5 w-5" />
              Widget Configuration
            </span>
            <Badge variant={widgetEnabled ? 'success' : 'secondary'}>
              {widgetEnabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </CardTitle>
          <CardDescription>
            Configure the embeddable widget for {custodian.name}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label htmlFor="widget-toggle">Enable Widget</Label>
              <p className="text-sm text-gray-500">
                Allow this custodian to embed the TrustRails widget on their platform
              </p>
            </div>
            <Switch
              id="widget-toggle"
              checked={widgetEnabled}
              onCheckedChange={handleToggleWidget}
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

      {widgetEnabled && (
        <Tabs defaultValue="api" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5 bg-gray-800">
            <TabsTrigger value="api">API Keys</TabsTrigger>
            <TabsTrigger value="domains">Domains</TabsTrigger>
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="embed">Embed Code</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          {/* API Keys Tab */}
          <TabsContent value="api" className="space-y-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  API Key Management
                </CardTitle>
                <CardDescription>
                  Manage API keys for widget authentication
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {custodian.widgetSettings?.apiKeyPrefix ? (
                  <div className="space-y-4">
                    <div>
                      <Label>Current API Key</Label>
                      <div className="flex gap-2 mt-2">
                        <div className="flex-1 relative">
                          <Input
                            value={apiKey ? (showApiKey ? apiKey : '•'.repeat(32)) : `${custodian.widgetSettings.apiKeyPrefix}...`}
                            readOnly
                            className="font-mono bg-gray-800 pr-10"
                          />
                          {apiKey && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="absolute right-1 top-1"
                              onClick={() => setShowApiKey(!showApiKey)}
                            >
                              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => navigator.clipboard.writeText(apiKey || `${custodian.widgetSettings?.apiKeyPrefix}...`)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleGenerateApiKey}
                          disabled={loading}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={handleRevokeApiKey}
                          disabled={loading}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {apiKey && (
                        <Alert className="mt-4 bg-yellow-900/20 border-yellow-800">
                          <AlertCircle className="h-4 w-4 text-yellow-500" />
                          <AlertDescription className="text-yellow-200">
                            Save this API key securely. You won't be able to see it again.
                          </AlertDescription>
                        </Alert>
                      )}
                      <p className="text-xs text-gray-500 mt-2">
                        Created: {custodian.widgetSettings.apiKeyCreatedAt?.toLocaleString() || 'Unknown'} |
                        Last used: {custodian.widgetSettings.apiKeyLastUsed?.toLocaleString() || 'Never'}
                      </p>
                    </div>

                    {/* Rate Limits */}
                    <div>
                      <Label>Rate Limits</Label>
                      <div className="grid grid-cols-3 gap-4 mt-2">
                        <div className="bg-gray-800 p-3 rounded-lg">
                          <p className="text-sm text-gray-400">Per Minute</p>
                          <p className="text-xl font-bold">{custodian.level === 2 ? '1000' : '500'}</p>
                        </div>
                        <div className="bg-gray-800 p-3 rounded-lg">
                          <p className="text-sm text-gray-400">Per Hour</p>
                          <p className="text-xl font-bold">{custodian.level === 2 ? '50K' : '25K'}</p>
                        </div>
                        <div className="bg-gray-800 p-3 rounded-lg">
                          <p className="text-sm text-gray-400">Per Day</p>
                          <p className="text-xl font-bold">{custodian.level === 2 ? '1M' : '500K'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Shield className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-400 mb-4">No API key generated yet</p>
                    <Button onClick={handleGenerateApiKey} disabled={loading}>
                      {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Key className="h-4 w-4 mr-2" />}
                      Generate API Key
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Allowed Domains Tab */}
          <TabsContent value="domains" className="space-y-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Allowed Domains
                </CardTitle>
                <CardDescription>
                  Configure which domains can embed the widget
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="example.com"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    className="bg-gray-800"
                  />
                  <Button onClick={handleAddDomain} disabled={loading}>
                    Add Domain
                  </Button>
                </div>

                <div className="space-y-2">
                  {allowedDomains.length > 0 ? (
                    allowedDomains.map((domain) => (
                      <div key={domain} className="flex items-center justify-between bg-gray-800 p-3 rounded-lg">
                        <span className="font-mono text-sm">{domain}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveDomain(domain)}
                          disabled={loading}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 text-center py-4">
                      No domains configured. Add domains to restrict widget embedding.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Appearance Tab */}
          <TabsContent value="appearance" className="space-y-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Widget Appearance
                </CardTitle>
                <CardDescription>
                  Customize the look and feel of your widget
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="primary-color">Primary Color</Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      id="primary-color"
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-20 h-10"
                    />
                    <Input
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="bg-gray-800"
                      placeholder="#3B82F6"
                    />
                  </div>
                </div>

                <div>
                  <Label>Preview</Label>
                  <div className="mt-2 bg-gray-800 p-6 rounded-lg">
                    <div className="max-w-md mx-auto">
                      <div
                        className="bg-white rounded-lg shadow-lg p-6"
                        style={{ borderTop: `4px solid ${primaryColor}` }}
                      >
                        <h3 className="text-lg font-semibold mb-2" style={{ color: primaryColor }}>
                          Start Your Rollover
                        </h3>
                        <p className="text-gray-600 mb-4">
                          Transfer your retirement savings in minutes
                        </p>
                        <button
                          className="w-full py-2 px-4 rounded text-white font-medium"
                          style={{ backgroundColor: primaryColor }}
                        >
                          Get Started
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Embed Code Tab */}
          <TabsContent value="embed" className="space-y-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code2 className="h-5 w-5" />
                  Integration Code
                </CardTitle>
                <CardDescription>
                  Copy this code to embed the widget on your platform
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>HTML Embed Code</Label>
                  <Textarea
                    value={embedCode}
                    readOnly
                    className="font-mono text-xs bg-gray-800 h-32 mt-2"
                  />
                  <Button
                    onClick={() => navigator.clipboard.writeText(embedCode)}
                    className="mt-2"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy to Clipboard
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" asChild>
                    <a href="/widget-demo" target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Test in Sandbox
                    </a>
                  </Button>
                  <Button variant="outline" asChild>
                    <a href="/docs/widget-integration" target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View Documentation
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Widget Analytics
                </CardTitle>
                <CardDescription>
                  Track widget usage and performance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-800 p-4 rounded-lg">
                    <p className="text-sm text-gray-400">Total Sessions</p>
                    <p className="text-2xl font-bold">
                      {custodian.widgetSettings?.analytics?.totalSessions || 0}
                    </p>
                  </div>
                  <div className="bg-gray-800 p-4 rounded-lg">
                    <p className="text-sm text-gray-400">Active Embeds</p>
                    <p className="text-2xl font-bold">
                      {custodian.widgetSettings?.analytics?.totalEmbeds || 0}
                    </p>
                  </div>
                  <div className="bg-gray-800 p-4 rounded-lg">
                    <p className="text-sm text-gray-400">Completed Rollovers</p>
                    <p className="text-2xl font-bold">
                      {custodian.widgetSettings?.analytics?.totalCompletedRollovers || 0}
                    </p>
                  </div>
                  <div className="bg-gray-800 p-4 rounded-lg">
                    <p className="text-sm text-gray-400">Conversion Rate</p>
                    <p className="text-2xl font-bold">
                      {custodian.widgetSettings?.analytics?.totalSessions
                        ? Math.round((custodian.widgetSettings.analytics.totalCompletedRollovers || 0) / custodian.widgetSettings.analytics.totalSessions * 100)
                        : 0}%
                    </p>
                  </div>
                </div>

                {custodian.widgetSettings?.analytics?.lastActivityAt && (
                  <p className="text-sm text-gray-500 mt-4">
                    Last activity: {new Date(custodian.widgetSettings.analytics.lastActivityAt).toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
```

### 3. Update Custodian Interface

Update `/lib/custodians.ts` to include widget fields:

```typescript
export interface Custodian {
  // ... existing fields ...

  // Widget Configuration
  widgetEnabled?: boolean;
  widgetSettings?: {
    apiKey?: string;  // Hashed
    apiKeyPrefix?: string;
    apiKeyCreatedAt?: Date;
    apiKeyLastUsed?: Date;
    primaryColor?: string;
    allowedDomains?: string[];
    analytics?: {
      totalSessions?: number;
      totalEmbeds?: number;
      totalCompletedRollovers?: number;
      lastActivityAt?: Date;
    };
  };
  widgetStatus?: 'active' | 'inactive' | 'suspended' | 'testing';
}
```

### 4. Create API Endpoints

Create `/app/api/admin/custodians/[custodianId]/widget/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/server-auth';
import { getCustodianById, updateCustodian } from '@/lib/server-custodians';

export async function GET(
  req: NextRequest,
  { params }: { params: { custodianId: string } }
) {
  const adminAuth = await verifyAdminAuth(req);
  if (!adminAuth.success) {
    return NextResponse.json({ error: adminAuth.error }, { status: 401 });
  }

  const custodian = await getCustodianById(params.custodianId);
  if (!custodian) {
    return NextResponse.json({ error: 'Custodian not found' }, { status: 404 });
  }

  return NextResponse.json(custodian.widgetSettings || {});
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { custodianId: string } }
) {
  const adminAuth = await verifyAdminAuth(req);
  if (!adminAuth.success) {
    return NextResponse.json({ error: adminAuth.error }, { status: 401 });
  }

  const updates = await req.json();

  await updateCustodian(params.custodianId, updates);

  return NextResponse.json({ success: true });
}
```

Create `/app/api/admin/custodians/[custodianId]/widget/api-key/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth } from '@/lib/server-auth';
import { updateCustodian } from '@/lib/server-custodians';
import { generateApiKey, hashApiKey } from '@/lib/api-key-utils';

export async function POST(
  req: NextRequest,
  { params }: { params: { custodianId: string } }
) {
  const adminAuth = await verifyAdminAuth(req);
  if (!adminAuth.success) {
    return NextResponse.json({ error: adminAuth.error }, { status: 401 });
  }

  const apiKey = generateApiKey();
  const hashedKey = await hashApiKey(apiKey);

  await updateCustodian(params.custodianId, {
    'widgetSettings.apiKey': hashedKey,
    'widgetSettings.apiKeyPrefix': apiKey.substring(0, 8),
    'widgetSettings.apiKeyCreatedAt': new Date(),
  });

  // Return full key only once
  return NextResponse.json({ apiKey });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { custodianId: string } }
) {
  const adminAuth = await verifyAdminAuth(req);
  if (!adminAuth.success) {
    return NextResponse.json({ error: adminAuth.error }, { status: 401 });
  }

  await updateCustodian(params.custodianId, {
    'widgetSettings.apiKey': null,
    'widgetSettings.apiKeyPrefix': null,
  });

  return NextResponse.json({ success: true });
}
```

### 5. Create API Key Utilities

Create `/lib/api-key-utils.ts`:

```typescript
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export function generateApiKey(): string {
  // Generate a 32-byte random key
  const buffer = crypto.randomBytes(32);
  // Encode as base64url for URL-safe keys
  return 'tr_' + buffer.toString('base64url');
}

export async function hashApiKey(apiKey: string): Promise<string> {
  // Use bcrypt for secure hashing
  return bcrypt.hash(apiKey, 10);
}

export async function validateApiKey(
  providedKey: string,
  hashedKey: string
): Promise<boolean> {
  return bcrypt.compare(providedKey, hashedKey);
}
```

## Summary

This implementation:
1. **Adds a Widget tab** to the existing custodian management interface
2. **Reuses existing UI components** (Cards, Tabs, Buttons, etc.)
3. **Follows the existing dark theme** and styling patterns
4. **Integrates with existing admin authentication**
5. **Provides complete widget management** including API keys, domains, appearance, and analytics

The widget functionality is now a native feature of custodians, not a separate partner system.