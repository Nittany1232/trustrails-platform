# TrustRails Professional Invitation Email Templates

## Overview

This document describes the comprehensive professional email template system implemented for TrustRails user invitations. The system supports three distinct user types with role-specific content, professional design, and SOC 2 compliance features.

## Features

### ✅ Professional Email Design
- **Modern gradient headers** with role-specific colors
- **Clean typography** using system fonts (-apple-system, Segoe UI, Roboto)
- **Mobile-responsive design** with proper media queries
- **Email client compatibility** with extensive inline CSS
- **Professional branding** appropriate for financial services

### ✅ Role-Specific Content
- **Three distinct user types**: custodian_user, rollover_user, admin
- **Custom subject lines** for each role
- **Role-specific benefits** and feature descriptions  
- **Tailored next steps** for each user type
- **Appropriate icons** and color schemes per role

### ✅ Security & Compliance
- **SOC 2 Type II compliance** messaging
- **Security notices** about token expiration and one-time use
- **Email verification requirements** clearly stated
- **Privacy protection** warnings against sharing links
- **Chain of custody** information with inviter details

### ✅ Content Customization
- **Personalized greetings** with inviter name
- **Organization name** integration when applicable
- **Custom message** support for personal notes
- **Flexible invitation details** with proper formatting
- **Expiration date** prominently displayed

## API Reference

### Primary Function: `sendInvitationEmail`

```typescript
export async function sendInvitationEmail(data: {
  invitationId: string;
  email: string;
  type: 'custodian_user' | 'rollover_user' | 'admin';
  organizationName?: string;
  inviterName?: string;
  inviterEmail: string;
  signupUrl: string;
  expiresAt: Date;
  customMessage?: string;
}): Promise<string>
```

### Role Configurations

#### Custodian User
- **Display Name**: Custodian Manager
- **Icon**: 🏢 (Building)
- **Primary Color**: #0ea5e9 (Blue)
- **Secondary Color**: #10b981 (Green)
- **Subject**: "Your Invitation to Manage [Organization] on TrustRails"
- **Features**: Organization profile, compliance documents, settlement configuration

#### Rollover User  
- **Display Name**: Account Holder
- **Icon**: 💼 (Briefcase)
- **Primary Color**: #059669 (Green)
- **Secondary Color**: #0ea5e9 (Blue)
- **Subject**: "Your TrustRails Account Access Invitation"
- **Features**: Rollover tracking, document upload, progress monitoring

#### Admin User
- **Display Name**: Platform Administrator
- **Icon**: 🔐 (Lock)
- **Primary Color**: #7c3aed (Purple)
- **Secondary Color**: #dc2626 (Red)
- **Subject**: "Your TrustRails Administrator Access Invitation"
- **Features**: System administration, compliance reports, platform configuration

## Email Template Structure

### Header Section
- TrustRails branding with role-specific icon
- Gradient background using role colors
- Professional subtitle: "Secure Retirement Account Platform"

### Content Sections
1. **Welcome & Introduction**
   - Personalized greeting
   - Clear role identification
   - Organization context when applicable

2. **Custom Message** (optional)
   - Personal note from inviter
   - Highlighted with special styling

3. **Access Benefits**
   - Role-specific feature list
   - Clear value proposition
   - Professional formatting

4. **Call-to-Action**
   - Prominent button with gradient styling
   - Clear action text: "Create Your Secure Account"
   - Hover effects for interactivity

5. **Security Notice**
   - SOC 2 compliance messaging
   - Token expiration information
   - Usage limitations and warnings

6. **Invitation Details**
   - Structured table format
   - Account type, organization, email, expiration
   - Clean, scannable layout

7. **Next Steps**
   - Role-specific action items
   - Clear progression guidance
   - Professional list formatting

### Footer Section
- Company information and branding
- SOC 2 Type II compliance badge
- Support contact information
- Privacy and security commitment

## Text Version Support

Both HTML and plain text versions are generated for each email:
- Clean text formatting without HTML tags
- Structured sections with clear headers
- All critical information preserved
- Security notices maintained
- Compatible with text-only email clients

## Security Features

### Token Management
- Unique 256-bit security tokens
- One-time use enforcement
- Expiration date tracking
- Access attempt monitoring

### Compliance Elements
- SOC 2 Type II compliance messaging
- Email verification requirements
- Privacy protection notices
- Audit trail documentation

### Security Warnings
- Clear instructions not to share links
- Expiration date prominently displayed
- Identity verification requirements
- Incorrect recipient handling

## Integration

### SecureInvitationService Integration
The email system is integrated with the SecureInvitationService for complete invitation lifecycle management:

```typescript
await sendInvitationEmail({
  invitationId: invitation.id,
  email,
  type: role,
  organizationName: custodianData.name,
  inviterName: invitedBy.name,
  inviterEmail: invitedBy.email,
  signupUrl: invitationUrl,
  expiresAt: invitation.expiresAt,
  customMessage: metadata?.customMessage
});
```

### Backward Compatibility
Legacy `sendEnhancedInvitationEmail` function is maintained for backward compatibility with deprecation warning.

## Testing & Validation

### Included Test Scripts
- `scripts/validate-email-templates.js` - Validates template structure and content
- `scripts/email-preview-sample.html` - Visual preview of custodian invitation

### Validation Areas
- Role configuration structure
- Email template elements
- Security features
- Design elements
- Content customization
- SOC 2 compliance
- Text version generation

## Implementation Notes

### File Updates
- **Primary**: `/lib/email-service-server.ts` - New template system
- **Integration**: `/lib/services/secure-invitation-service.ts` - Updated to use new emails
- **Documentation**: This file and test scripts

### Key Functions
- `sendInvitationEmail()` - Main email sending function
- `getRoleConfig()` - Role-specific configuration
- `generateProfessionalEmailTemplate()` - HTML template generation  
- `generateTextVersion()` - Plain text version generation

### Design Principles
- **Professional first** - Appropriate for financial services
- **Security focused** - Clear compliance and security messaging
- **User-centric** - Role-specific content and guidance
- **Mobile-ready** - Responsive design for all devices
- **Accessible** - Clean typography and proper contrast

## Future Enhancements

### Potential Improvements
- A/B testing for subject lines
- Additional customization options
- Internationalization support
- Email analytics integration
- Template versioning system

### Maintenance Considerations
- Regular security review of messaging
- SOC 2 compliance updates
- Email client compatibility testing
- Performance monitoring
- User feedback integration

## Summary

The TrustRails invitation email template system provides:
- **Professional design** appropriate for financial services
- **Role-specific content** for three distinct user types
- **SOC 2 compliance** with proper security messaging
- **Mobile-responsive** design with email client compatibility
- **Comprehensive security** features and notices
- **Flexible customization** options for personalization
- **Complete integration** with existing invitation system

This implementation significantly enhances the user onboarding experience while maintaining the highest security and compliance standards required for financial services platforms.