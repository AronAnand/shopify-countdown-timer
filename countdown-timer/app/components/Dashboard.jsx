import React, { useState, useCallback } from 'react';
import {
    Page,
    Layout,
    Card,
    IndexTable,
    Text,
    Badge,
    Button,
    EmptyState,
    Spinner,
    Banner,
    Modal,
    TextContainer,
    useIndexResourceState
} from '@shopify/polaris';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthenticatedFetch } from '../hooks/useAuthenticatedFetch';

/**
 * Dashboard Component - Displays all timers in a table
 * Uses Polaris IndexTable for consistent Shopify admin styling
 */
export default function Dashboard() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const authenticatedFetch = useAuthenticatedFetch();

    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [timerToDelete, setTimerToDelete] = useState(null);

    // Fetch timers
    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['timers'],
        queryFn: async () => {
            const response = await authenticatedFetch('/api/timers');
            if (!response.ok) {
                throw new Error('Failed to fetch timers');
            }
            return response.json();
        }
    });

    // Delete mutation
    const deleteMutation = useMutation({
        mutationFn: async (timerId) => {
            const response = await authenticatedFetch(`/api/timers/${timerId}`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                throw new Error('Failed to delete timer');
            }
            return response.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['timers'] });
            setDeleteModalOpen(false);
            setTimerToDelete(null);
        }
    });

    // Handle delete button click
    const handleDeleteClick = useCallback((timer) => {
        setTimerToDelete(timer);
        setDeleteModalOpen(true);
    }, []);

    // Confirm delete
    const handleConfirmDelete = useCallback(() => {
        if (timerToDelete) {
            deleteMutation.mutate(timerToDelete._id);
        }
    }, [timerToDelete, deleteMutation]);

    // Cancel delete
    const handleCancelDelete = useCallback(() => {
        setDeleteModalOpen(false);
        setTimerToDelete(null);
    }, []);

    // Navigate to edit page
    const handleEditClick = useCallback((timerId) => {
        navigate(`/timers/${timerId}/edit`);
    }, [navigate]);

    // Get status badge
    const getStatusBadge = (status) => {
        const statusMap = {
            active: { tone: 'success', label: 'Active' },
            scheduled: { tone: 'info', label: 'Scheduled' },
            expired: { tone: 'critical', label: 'Expired' },
            inactive: { tone: 'new', label: 'Inactive' }
        };

        const { tone, label } = statusMap[status] || { tone: 'new', label: status };
        return <Badge tone={tone}>{label}</Badge>;
    };

    // Get type badge
    const getTypeBadge = (type) => {
        return type === 'fixed'
            ? <Badge>Fixed</Badge>
            : <Badge tone="attention">Evergreen</Badge>;
    };

    // Format number with commas
    const formatNumber = (num) => {
        return new Intl.NumberFormat().format(num || 0);
    };

    const timers = data?.data || [];
    const resourceName = {
        singular: 'timer',
        plural: 'timers'
    };

    const { selectedResources, allResourcesSelected, handleSelectionChange } =
        useIndexResourceState(timers);

    // Row markup for IndexTable
    const rowMarkup = timers.map((timer, index) => (
        <IndexTable.Row
            id={timer._id}
            key={timer._id}
            position={index}
            selected={selectedResources.includes(timer._id)}
        >
            <IndexTable.Cell>
                <Text variant="bodyMd" fontWeight="semibold" as="span">
                    {timer.name}
                </Text>
            </IndexTable.Cell>
            <IndexTable.Cell>
                {getStatusBadge(timer.status)}
            </IndexTable.Cell>
            <IndexTable.Cell>
                {getTypeBadge(timer.type)}
            </IndexTable.Cell>
            <IndexTable.Cell>
                <Text variant="bodyMd" as="span">
                    {formatNumber(timer.impressions)}
                </Text>
            </IndexTable.Cell>
            <IndexTable.Cell>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button size="slim" onClick={() => handleEditClick(timer._id)}>
                        Edit
                    </Button>
                    <Button
                        size="slim"
                        tone="critical"
                        onClick={() => handleDeleteClick(timer)}
                        loading={deleteMutation.isPending && timerToDelete?._id === timer._id}
                    >
                        Delete
                    </Button>
                </div>
            </IndexTable.Cell>
        </IndexTable.Row>
    ));

    // Loading state
    if (isLoading) {
        return (
            <Page title="Countdown Timers">
                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                    <Spinner size="large" />
                </div>
            </Page>
        );
    }

    // Error state
    if (isError) {
        return (
            <Page title="Countdown Timers">
                <Banner tone="critical">
                    <p>Failed to load timers: {error.message}</p>
                </Banner>
            </Page>
        );
    }

    // Empty state
    if (timers.length === 0) {
        return (
            <Page title="Countdown Timers">
                <Card>
                    <EmptyState
                        heading="Create your first countdown timer"
                        action={{
                            content: 'Create Timer',
                            onAction: () => navigate('/timers/new')
                        }}
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    >
                        <p>
                            Countdown timers create urgency and boost conversions.
                            Create a timer to display on your product pages.
                        </p>
                    </EmptyState>
                </Card>
            </Page>
        );
    }

    return (
        <Page
            title="Countdown Timers"
            primaryAction={{
                content: 'Create Timer',
                onAction: () => navigate('/timers/new')
            }}
        >
            <Layout>
                <Layout.Section>
                    <Card padding="0">
                        <IndexTable
                            resourceName={resourceName}
                            itemCount={timers.length}
                            selectedItemsCount={
                                allResourcesSelected ? 'All' : selectedResources.length
                            }
                            onSelectionChange={handleSelectionChange}
                            headings={[
                                { title: 'Name' },
                                { title: 'Status' },
                                { title: 'Type' },
                                { title: 'Impressions' },
                                { title: 'Actions' }
                            ]}
                        >
                            {rowMarkup}
                        </IndexTable>
                    </Card>
                </Layout.Section>
            </Layout>

            {/* Delete Confirmation Modal */}
            <Modal
                open={deleteModalOpen}
                onClose={handleCancelDelete}
                title="Delete Timer"
                primaryAction={{
                    content: 'Delete',
                    destructive: true,
                    onAction: handleConfirmDelete,
                    loading: deleteMutation.isPending
                }}
                secondaryActions={[
                    {
                        content: 'Cancel',
                        onAction: handleCancelDelete
                    }
                ]}
            >
                <Modal.Section>
                    <TextContainer>
                        <p>
                            Are you sure you want to delete "{timerToDelete?.name}"?
                            This action cannot be undone.
                        </p>
                    </TextContainer>
                </Modal.Section>
            </Modal>
        </Page>
    );
}
