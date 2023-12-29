#!/bin/bash

# Delete PVC, PV, and SC
echo "Deleting PVC, PV, and SC..."
kubectl delete pvc azure-blob-nfs-pvc
kubectl delete pv azure-blob-nfs-pv
kubectl delete sc azure-blob-nfs-sc

# Recreate SC, PV, and PVC
echo "Recreating SC, PV, and PVC..."
kubectl apply -f azure-blob-nfs-sc.yaml
kubectl apply -f azure-blob-nfs-pv.yaml
kubectl apply -f azure-blob-nfs-pvc.yaml

