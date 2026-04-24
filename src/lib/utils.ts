import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { UserProfile } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTimestamp(timestamp: any): string {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const datePart = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const timePart = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${datePart}, ${timePart}`;
}

export function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'bg-red-600 text-white';
    case 'high': return 'bg-orange-500 text-white';
    case 'medium': return 'bg-yellow-500 text-black';
    case 'low': return 'bg-blue-500 text-white';
    default: return 'bg-gray-500 text-white';
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'reported': return 'text-red-600';
    case 'responding': return 'text-blue-600';
    case 'resolved': return 'text-green-600';
    default: return 'text-gray-500';
  }
}

export function getRoleDisplayName(profile?: UserProfile | null): string {
  if (!profile) return 'User';
  
  if (profile.role === 'security') {
    if (profile.securityType) {
      return `${profile.securityType.charAt(0).toUpperCase() + profile.securityType.slice(1)} Security`;
    }
    // Fallback to ID suffix if securityType is missing from profile but present in code
    if (profile.uniqueId) {
      if (profile.uniqueId.endsWith('FI')) return 'Fire Security';
      if (profile.uniqueId.endsWith('MD')) return 'Medical Security';
      if (profile.uniqueId.endsWith('TH')) return 'Theft Security';
      if (profile.uniqueId.endsWith('OT')) return 'Other Security';
    }
    return 'Security';
  }
  
  return profile.role.charAt(0).toUpperCase() + profile.role.slice(1);
}
