import React from 'react';

interface SkeletonProps {
    className?: string;
    variant?: 'text' | 'circle' | 'rect' | 'card' | 'row';
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', variant = 'rect' }) => {
    const baseClass = "animate-pulse bg-slate-200/80 rounded-lg";
    
    if (variant === 'text') {
        return <div className={`${baseClass} h-3.5 w-5/6 ${className}`} />;
    }
    if (variant === 'circle') {
        return <div className={`${baseClass} rounded-full ${className}`} />;
    }
    if (variant === 'row') {
        return (
            <div className={`flex items-center space-x-4 py-4 border-b border-gray-100 ${className}`}>
                <div className="animate-pulse bg-slate-200 rounded-full h-12 w-12 shrink-0" />
                <div className="space-y-2 flex-1">
                    <div className="animate-pulse bg-slate-200 h-3.5 w-1/4 rounded" />
                    <div className="animate-pulse bg-slate-200 h-3 w-1/2 rounded" />
                </div>
                <div className="animate-pulse bg-slate-200 h-7 w-20 rounded-xl" />
            </div>
        );
    }
    if (variant === 'card') {
        return (
            <div className={`border border-gray-100 rounded-[2rem] p-5 bg-white space-y-4 shadow-sm ${className}`}>
                <div className="animate-pulse bg-slate-200 h-48 rounded-2xl w-full" />
                <div className="space-y-2.5">
                    <div className="animate-pulse bg-slate-200 h-4.5 w-2/3 rounded-lg" />
                    <div className="animate-pulse bg-slate-200 h-3.5 w-1/2 rounded-md" />
                </div>
                <div className="pt-3 border-t border-gray-50 flex justify-between items-center">
                    <div className="animate-pulse bg-slate-200 h-4 w-12 rounded" />
                    <div className="animate-pulse bg-slate-200 h-8 w-24 rounded-2xl" />
                </div>
            </div>
        );
    }

    return <div className={`${baseClass} ${className}`} />;
};

export const CardGridSkeleton: React.FC<{ count?: number, className?: string }> = ({ count = 6, className = "" }) => {
    return (
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 ${className}`}>
            {Array.from({ length: count }).map((_, i) => (
                <Skeleton key={i} variant="card" />
            ))}
        </div>
    );
};

export const TableSkeleton: React.FC<{ rows?: number, className?: string }> = ({ rows = 5, className = "" }) => {
    return (
        <div className={`space-y-1 bg-white rounded-[2rem] p-6 border border-gray-100 shadow-sm ${className}`}>
            {Array.from({ length: rows }).map((_, i) => (
                <Skeleton key={i} variant="row" />
            ))}
        </div>
    );
};
