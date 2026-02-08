import React, { useState, useCallback } from 'react';
import {
    Page,
    Layout,
    Card,
    FormLayout,
    TextField,
    Select,
    Button,
    Banner,
    Text,
    InlineStack,
    BlockStack,
    Divider,
    Box
} from '@shopify/polaris';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch';

/**
 * CreateTimer Component - Form to create new countdown timers
 * Includes AI generation feature and ResourcePicker for products/collections
 */
export default function CreateTimer() {
    const navigate = useNavigate();
    const authenticatedFetch = useAuthenticatedFetch();

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        type: 'evergreen',
        startDate: '',
        endDate: '',
        durationMinutes: 60,
        targeting: {
            scope: 'all',
            productIds: [],
            collectionIds: []
        },
        appearance: {
            backgroundColor: '#000000',
            textColor: '#FFFFFF',
            position: 'above-cart',
            headline: 'Hurry! Offer ends soon',
            supportingText: ''
        }
    });

    // Resource picker state
    const [resourcePickerOpen, setResourcePickerOpen] = useState(false);
    const [resourceType, setResourceType] = useState('Product');

    // Validation errors
    const [errors, setErrors] = useState({});

    // Create timer mutation
    const createMutation = useMutation({
        mutationFn: async (data) => {
            const response = await authenticatedFetch('/api/timers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to create timer');
            }

            return response.json();
        },
        onSuccess: () => {
            navigate('/');
        }
    });


    // Handle field changes
    const handleChange = useCallback((field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        // Clear error for this field
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: undefined }));
        }
    }, [errors]);

    // Handle nested field changes
    const handleNestedChange = useCallback((parent, field, value) => {
        setFormData(prev => ({
            ...prev,
            [parent]: { ...prev[parent], [field]: value }
        }));
    }, []);

    // Validate form
    const validateForm = useCallback(() => {
        const newErrors = {};

        if (!formData.name.trim()) {
            newErrors.name = 'Timer name is required';
        }

        if (formData.type === 'fixed') {
            if (!formData.startDate) {
                newErrors.startDate = 'Start date is required';
            }
            if (!formData.endDate) {
                newErrors.endDate = 'End date is required';
            }
            if (formData.startDate && formData.endDate) {
                if (new Date(formData.endDate) <= new Date(formData.startDate)) {
                    newErrors.endDate = 'End date must be after start date';
                }
            }
        }

        if (formData.type === 'evergreen') {
            if (!formData.durationMinutes || formData.durationMinutes < 1) {
                newErrors.durationMinutes = 'Duration must be at least 1 minute';
            }
        }

        if (formData.targeting.scope === 'products' && formData.targeting.productIds.length === 0) {
            newErrors.products = 'Select at least one product';
        }

        if (formData.targeting.scope === 'collections' && formData.targeting.collectionIds.length === 0) {
            newErrors.collections = 'Select at least one collection';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }, [formData]);

    // Handle form submission
    const handleSubmit = useCallback(() => {
        if (validateForm()) {
            // Convert duration hours to minutes if needed
            const submitData = { ...formData };

            // Convert dates to ISO strings for fixed timers
            if (formData.type === 'fixed') {
                submitData.startDate = new Date(formData.startDate).toISOString();
                submitData.endDate = new Date(formData.endDate).toISOString();
                delete submitData.durationMinutes;
            } else {
                delete submitData.startDate;
                delete submitData.endDate;
            }

            createMutation.mutate(submitData);
        }
    }, [formData, validateForm, createMutation]);


    // Timer type options
    const typeOptions = [
        { label: 'Evergreen (resets per visitor)', value: 'evergreen' },
        { label: 'Fixed (same for everyone)', value: 'fixed' }
    ];

    // Target scope options
    const scopeOptions = [
        { label: 'All products', value: 'all' },
        { label: 'Specific products', value: 'products' },
        { label: 'Specific collections', value: 'collections' }
    ];

    // Position options
    const positionOptions = [
        { label: 'Above Add to Cart', value: 'above-cart' },
        { label: 'Below Add to Cart', value: 'below-cart' },
        { label: 'Top of page', value: 'top' },
        { label: 'Bottom of page', value: 'bottom' }
    ];

    // Hours options for duration
    const durationOptions = [
        { label: '30 minutes', value: '30' },
        { label: '1 hour', value: '60' },
        { label: '2 hours', value: '120' },
        { label: '4 hours', value: '240' },
        { label: '8 hours', value: '480' },
        { label: '12 hours', value: '720' },
        { label: '24 hours', value: '1440' },
        { label: '48 hours', value: '2880' }
    ];

    return (
        <Page
            title="Create Timer"
            breadcrumbs={[{ content: 'Timers', onAction: () => navigate('/') }]}
            primaryAction={{
                content: 'Save',
                onAction: handleSubmit,
                loading: createMutation.isPending
            }}
        >
            <Layout>

                {createMutation.isError && (
                    <Layout.Section>
                        <Banner tone="critical">
                            <p>{createMutation.error.message}</p>
                        </Banner>
                    </Layout.Section>
                )}

                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text variant="headingMd" as="h2">Basic Settings</Text>

                            <FormLayout>
                                <TextField
                                    label="Timer Name"
                                    value={formData.name}
                                    onChange={(value) => handleChange('name', value)}
                                    placeholder="e.g., Black Friday Sale Timer"
                                    error={errors.name}
                                    autoComplete="off"
                                />

                                <Select
                                    label="Timer Type"
                                    options={typeOptions}
                                    value={formData.type}
                                    onChange={(value) => handleChange('type', value)}
                                    helpText={
                                        formData.type === 'evergreen'
                                            ? 'Timer starts when each visitor first sees it'
                                            : 'Same countdown for all visitors'
                                    }
                                />

                                {formData.type === 'fixed' && (
                                    <FormLayout.Group>
                                        <TextField
                                            label="Start Date & Time"
                                            type="datetime-local"
                                            value={formData.startDate}
                                            onChange={(value) => handleChange('startDate', value)}
                                            error={errors.startDate}
                                        />
                                        <TextField
                                            label="End Date & Time"
                                            type="datetime-local"
                                            value={formData.endDate}
                                            onChange={(value) => handleChange('endDate', value)}
                                            error={errors.endDate}
                                        />
                                    </FormLayout.Group>
                                )}

                                {formData.type === 'evergreen' && (
                                    <Select
                                        label="Duration"
                                        options={durationOptions}
                                        value={String(formData.durationMinutes)}
                                        onChange={(value) => handleChange('durationMinutes', parseInt(value))}
                                        error={errors.durationMinutes}
                                        helpText="How long the countdown lasts for each visitor"
                                    />
                                )}
                            </FormLayout>
                        </BlockStack>
                    </Card>
                </Layout.Section>

                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text variant="headingMd" as="h2">Targeting</Text>

                            <FormLayout>
                                <Select
                                    label="Show timer on"
                                    options={scopeOptions}
                                    value={formData.targeting.scope}
                                    onChange={(value) => handleNestedChange('targeting', 'scope', value)}
                                />

                                {formData.targeting.scope === 'products' && (
                                    <BlockStack gap="200">
                                        <Button onClick={() => {
                                            setResourceType('Product');
                                            setResourcePickerOpen(true);
                                        }}>
                                            Select Products
                                        </Button>
                                        {formData.targeting.productIds.length > 0 && (
                                            <Text variant="bodySm" as="p">
                                                {formData.targeting.productIds.length} product(s) selected
                                            </Text>
                                        )}
                                        {errors.products && (
                                            <Text variant="bodySm" as="p" tone="critical">
                                                {errors.products}
                                            </Text>
                                        )}
                                    </BlockStack>
                                )}

                                {formData.targeting.scope === 'collections' && (
                                    <BlockStack gap="200">
                                        <Button onClick={() => {
                                            setResourceType('Collection');
                                            setResourcePickerOpen(true);
                                        }}>
                                            Select Collections
                                        </Button>
                                        {formData.targeting.collectionIds.length > 0 && (
                                            <Text variant="bodySm" as="p">
                                                {formData.targeting.collectionIds.length} collection(s) selected
                                            </Text>
                                        )}
                                        {errors.collections && (
                                            <Text variant="bodySm" as="p" tone="critical">
                                                {errors.collections}
                                            </Text>
                                        )}
                                    </BlockStack>
                                )}
                            </FormLayout>
                        </BlockStack>
                    </Card>
                </Layout.Section>

                <Layout.Section>
                    <Card>
                        <BlockStack gap="400">
                            <Text variant="headingMd" as="h2">Appearance</Text>

                            <FormLayout>
                                <TextField
                                    label="Headline"
                                    value={formData.appearance.headline}
                                    onChange={(value) => handleNestedChange('appearance', 'headline', value)}
                                    placeholder="Hurry! Offer ends soon"
                                    maxLength={50}
                                    showCharacterCount
                                />

                                <TextField
                                    label="Supporting Text (optional)"
                                    value={formData.appearance.supportingText}
                                    onChange={(value) => handleNestedChange('appearance', 'supportingText', value)}
                                    placeholder="Don't miss out on this limited-time offer"
                                    maxLength={100}
                                    showCharacterCount
                                />

                                <Select
                                    label="Position"
                                    options={positionOptions}
                                    value={formData.appearance.position}
                                    onChange={(value) => handleNestedChange('appearance', 'position', value)}
                                />

                                <FormLayout.Group>
                                    <TextField
                                        label="Background Color"
                                        value={formData.appearance.backgroundColor}
                                        onChange={(value) => handleNestedChange('appearance', 'backgroundColor', value)}
                                        prefix={
                                            <div
                                                style={{
                                                    width: 20,
                                                    height: 20,
                                                    backgroundColor: formData.appearance.backgroundColor,
                                                    borderRadius: 4,
                                                    border: '1px solid #ccc'
                                                }}
                                            />
                                        }
                                    />
                                    <TextField
                                        label="Text Color"
                                        value={formData.appearance.textColor}
                                        onChange={(value) => handleNestedChange('appearance', 'textColor', value)}
                                        prefix={
                                            <div
                                                style={{
                                                    width: 20,
                                                    height: 20,
                                                    backgroundColor: formData.appearance.textColor,
                                                    borderRadius: 4,
                                                    border: '1px solid #ccc'
                                                }}
                                            />
                                        }
                                    />
                                </FormLayout.Group>
                            </FormLayout>

                            {/* Preview */}
                            <Divider />
                            <Text variant="headingSm" as="h3">Preview</Text>
                            <Box
                                padding="400"
                                borderRadius="200"
                                background="bg-surface-secondary"
                            >
                                <div
                                    style={{
                                        backgroundColor: formData.appearance.backgroundColor,
                                        color: formData.appearance.textColor,
                                        padding: '16px',
                                        borderRadius: '8px',
                                        textAlign: 'center'
                                    }}
                                >
                                    <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
                                        {formData.appearance.headline || 'Your headline here'}
                                    </div>
                                    <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'monospace' }}>
                                        00:00:00
                                    </div>
                                    {formData.appearance.supportingText && (
                                        <div style={{ fontSize: '12px', marginTop: '8px', opacity: 0.8 }}>
                                            {formData.appearance.supportingText}
                                        </div>
                                    )}
                                </div>
                            </Box>
                        </BlockStack>
                    </Card>
                </Layout.Section>

                <Layout.Section>
                    <InlineStack align="end" gap="300">
                        <Button onClick={() => navigate('/')}>Cancel</Button>
                        <Button
                            variant="primary"
                            onClick={handleSubmit}
                            loading={createMutation.isPending}
                        >
                            Create Timer
                        </Button>
                    </InlineStack>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
